//! Central sign-in: the MIS session is the only one that matters.
//!
//! Every app is a client-side SPA, so page loads don't show what the
//! session is doing (Tendo's "/" is its sign-in page, but a signed-in user is
//! sent on from it in client code). The watcher samples each app webview's URL
//! every 1.5 s and acts only on a state that has held for 3 s:
//!
//! - **MIS becomes signed in:** sign every other app in, in the background
//!   (hidden webviews running MIS's SSO login hop), so they're ready and can
//!   deliver notifications. A spoke tab parked on MIS's sign-in page is sent
//!   through the hop again; it now continues on its own.
//! - **MIS becomes signed out** (logout, expiry, switching account): close the
//!   other apps and forget their handshakes. MIS's back-channel logout has
//!   already ended their server sessions; this also clears their screens.
//! - **A spoke shows its own signed-out page while MIS is signed in:** run its
//!   SSO hop again (at most once a minute per app).

use crate::registry::{self, AppDef};
use crate::webviews::{self, Shell};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime, Url};
use tauri_plugin_store::StoreExt;

/// Fast enough that an app appears the moment its sign-in lands.
const TICK: Duration = Duration::from_millis(400);
/// How long a page must hold before we believe it. "Signed in" needs longer:
/// MIS first shows /home from a cached token, and only then checks the session
/// with the server and may move to /login.
const STABLE: Duration = Duration::from_secs(3);
const STABLE_SIGNED_IN: Duration = Duration::from_secs(3);

// ── What other modules need to know ─────────────────────────────────────────

/// MIS session as last seen: 0 unknown, 1 signed in, 2 signed out.
static MIS_STATE: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);
/// Apps last seen on one of their own signed-in pages (updated every tick, so
/// it follows client-side page changes too).
static SIGNED_IN_APPS: std::sync::Mutex<Vec<&'static str>> = std::sync::Mutex::new(Vec::new());
static SIGNING_OUT: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn mis_signed_in() -> Option<bool> {
    match MIS_STATE.load(std::sync::atomic::Ordering::SeqCst) {
        1 => Some(true),
        2 => Some(false),
        _ => None,
    }
}

fn set_mis_state(state: Option<bool>) {
    let v = match state {
        Some(true) => 1,
        Some(false) => 2,
        None => 0,
    };
    MIS_STATE.store(v, std::sync::atomic::Ordering::SeqCst);
}

pub fn was_signed_in(key: &str) -> bool {
    SIGNED_IN_APPS.lock().unwrap().contains(&key)
}

/// Sign out of every NGA app: MIS signs out (which ends every app's session
/// through the back-channel logout), the other apps close, and the shell shows
/// "Signing you out…" until MIS's sign-in page is back. `wipe`: also clear the
/// whole browsing profile (Settings → "Sign out of this computer").
pub async fn sign_out_everywhere<R: Runtime>(app: AppHandle<R>, wipe: bool) {
    use std::sync::atomic::Ordering;
    if SIGNING_OUT.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = app.emit_to(webviews::SHELL, "nga://signout", "start");
    let mis_key = registry::identity_provider(&app.state::<Shell>().apps).key;
    if let Some(mis) = app.get_webview(&webviews::label(mis_key)) {
        let js = format!(
            "(function(){{var go=function(){{try{{localStorage.removeItem('token')}}catch(e){{}}location.replace('/login')}};try{{var t=localStorage.getItem('token');if(t){{fetch('{api}/auth/logout',{{method:'POST',credentials:'include',keepalive:true,headers:{{Authorization:'Bearer '+t}}}}).catch(function(){{}}).then(go);setTimeout(go,1200);return}}}}catch(e){{}}go()}})();",
            api = registry::mis_api_base()
        );
        let _ = mis.eval(js);
    }
    tokio::time::sleep(Duration::from_millis(1500)).await;
    webviews::close_spokes(&app);
    webviews::forget_sso(&app);
    SIGNED_IN_APPS.lock().unwrap().clear();
    set_mis_state(Some(false));
    let _ = app.emit_to(webviews::SHELL, "nga://auth", false);
    if wipe {
        if let Some(shell) = app.get_webview(webviews::SHELL) {
            let _ = shell.clear_all_browsing_data();
        }
        webviews::close_all_apps(&app);
        let _ = app.emit_to(webviews::SHELL, "nga://signed-out", ());
    }
    app.state::<crate::notifications::Notifier>().clear();
    crate::notifications::publish(&app);
    // Let MIS's sign-in page settle before the screen goes away.
    tokio::time::sleep(Duration::from_millis(700)).await;
    SIGNING_OUT.store(false, Ordering::SeqCst);
    let _ = app.emit_to(webviews::SHELL, "nga://signout", "done");
}
const RESSO_EVERY: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Page {
    SignedIn,
    SignedOut,
    /// Public page, SSO callback, MIS's SSO consent: says nothing.
    Neutral,
    /// The webview is on another origin (a spoke in the middle of the MIS hop).
    Elsewhere,
}

pub fn classify(def: &AppDef, url: &Url) -> Page {
    if !def.owns(url) {
        return Page::Elsewhere;
    }
    let path = url.path().strip_prefix(def.base).unwrap_or(url.path());
    let path = if path.is_empty() { "/" } else { path };
    // MIS's /login?client_id=… is the SSO consent screen, not a signed-out MIS.
    if def.sso.is_none() && url.query_pairs().any(|(k, _)| k == "client_id") {
        return Page::Neutral;
    }
    if def.signed_out_paths.contains(&path) {
        return Page::SignedOut;
    }
    if def.neutral_paths.iter().any(|p| path.starts_with(p)) || path == "/sso/callback" {
        return Page::Neutral;
    }
    Page::SignedIn
}

fn is_callback(def: &AppDef, url: &Url) -> bool {
    def.owns(url) && url.path().contains("callback")
}

/// Can this page be shown as soon as it loads? MIS: always. A spoke: only its
/// own signed-in (or public) pages, never the SSO hop.
pub fn shows_immediately(def: &AppDef, url: &Url) -> bool {
    if def.sso.is_none() {
        return true;
    }
    match classify(def, url) {
        Page::SignedIn => true,
        Page::Neutral => !is_callback(def, url),
        Page::SignedOut | Page::Elsewhere => false,
    }
}

/// A spoke still hidden while it signs in: show it anyway once it's clear the
/// person has to act (MIS's sign-in form, or the app's own sign-in page, held
/// for a few seconds), or after 20 s whatever happens.
pub fn reveal(
    shows_now: bool,
    page: Page,
    callback: bool,
    held: Duration,
    waiting: Duration,
) -> bool {
    if shows_now {
        return true;
    }
    // On MIS's sign-in form inside the app's tab: never. The person signs in
    // once, in MIS; the shell shows "Sign in to NGA MIS" for this tab instead.
    if page == Page::Elsewhere {
        return false;
    }
    if waiting >= Duration::from_secs(20) {
        return true;
    }
    match page {
        Page::SignedOut => held >= Duration::from_secs(4),
        Page::Neutral if callback => held >= Duration::from_secs(10),
        _ => false,
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum MisChange {
    SignedIn,
    SignedOut,
}

/// New MIS session state from a stable page, and whether that is a change worth acting on.
pub fn mis_change(prev: Option<bool>, stable: Page) -> (Option<bool>, Option<MisChange>) {
    match stable {
        Page::SignedIn if prev != Some(true) => (Some(true), Some(MisChange::SignedIn)),
        Page::SignedOut if prev == Some(true) => (Some(false), Some(MisChange::SignedOut)),
        Page::SignedOut => (Some(false), None),
        _ => (prev, None),
    }
}

/// Is `url` a spoke webview waiting on MIS's sign-in page for its SSO hop?
fn parked_on_mis_login(apps: &[AppDef], url: &Url) -> bool {
    let mis = registry::identity_provider(apps);
    mis.owns(url) && url.path() == "/login" && url.query_pairs().any(|(k, _)| k == "client_id")
}

#[derive(Default)]
struct Watch {
    seen: HashMap<&'static str, (Page, Instant)>,
    /// When each hidden spoke started signing in.
    hidden_since: HashMap<&'static str, Instant>,
    mis: Option<bool>,
    last_resso: HashMap<&'static str, Instant>,
}

fn background_sign_in<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get("backgroundSignIn"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

pub fn spawn<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        // MIS is the identity hub: keep it loaded (hidden) even when another app
        // is on screen, or nothing could tell that the person is signed in,
        // background sign-in would never start and MIS's notifications would stay silent.
        tokio::time::sleep(Duration::from_millis(1500)).await;
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            let mis = registry::identity_provider(&handle.state::<Shell>().apps).key;
            if let Err(e) = webviews::ensure_app(&handle, mis) {
                log::warn!("could not start NGA MIS in the background: {e}");
            }
        });
        let mut watch = Watch::default();
        loop {
            tokio::time::sleep(TICK).await;
            tick(&app, &mut watch);
        }
    });
}

fn tick<R: Runtime>(app: &AppHandle<R>, watch: &mut Watch) {
    let apps = app.state::<Shell>().apps.clone();
    let now = Instant::now();
    let mut stable: HashMap<&'static str, (Page, Url)> = HashMap::new();
    for def in &apps {
        let Some(wv) = app.get_webview(&webviews::label(def.key)) else {
            watch.seen.remove(def.key);
            watch.hidden_since.remove(def.key);
            continue;
        };
        let Ok(url) = wv.url() else { continue };
        let page = classify(def, &url);
        {
            let mut list = SIGNED_IN_APPS.lock().unwrap();
            let present = list.contains(&def.key);
            if page == Page::SignedIn && !present {
                list.push(def.key);
            } else if page == Page::SignedOut && present {
                list.retain(|k| *k != def.key);
            }
        }
        let since = match watch.seen.get(def.key) {
            Some((p, t)) if *p == page => *t,
            _ => {
                watch.seen.insert(def.key, (page, now));
                now
            }
        };
        // A spoke kept hidden while it signs in: show it when it lands (SPA
        // redirects don't fire page loads, so this is where it's noticed).
        if def.sso.is_some() && !webviews::is_ready(app, def.key) {
            let waiting = now.duration_since(*watch.hidden_since.entry(def.key).or_insert(now));
            let held = now.duration_since(since);
            if reveal(
                shows_immediately(def, &url),
                page,
                is_callback(def, &url),
                held,
                waiting,
            ) {
                if page == Page::SignedIn {
                    log::info!("[{}] signed in and shown", def.key);
                } else {
                    log::info!(
                        "[{}] shown: waiting for the person to sign in ({:?})",
                        def.key,
                        page
                    );
                }
                watch.hidden_since.remove(def.key);
                webviews::mark_ready(app, def.key, &url);
            }
        }
        let needed = if page == Page::SignedIn {
            STABLE_SIGNED_IN
        } else {
            STABLE
        };
        if now.duration_since(since) >= needed {
            stable.insert(def.key, (page, url));
        }
    }

    // Meeting / quiz in progress anywhere? (the notification manager holds banners)
    let session = apps.iter().find_map(|def| {
        let wv = app.get_webview(&webviews::label(def.key))?;
        let url = wv.url().ok()?;
        def.is_focus_page(&url).then(|| def.key.to_string())
    });
    let notifier = app.state::<crate::notifications::Notifier>();
    if notifier.set_focus_session(session.clone()) {
        let _ = app.emit_to(webviews::SHELL, "nga://focus-session", session);
    }

    let mis_key = registry::identity_provider(&apps).key;
    if let Some((page, mis_url)) = stable.get(mis_key) {
        let mis_url = webviews::redact(mis_url);
        let (next, change) = mis_change(watch.mis, *page);
        watch.mis = next;
        set_mis_state(next);
        match change {
            Some(MisChange::SignedIn) => {
                log::info!("MIS signed in ({mis_url})");
                let _ = app.emit_to(webviews::SHELL, "nga://auth", true);
                if background_sign_in(app) {
                    warm_spokes(app, &apps);
                }
                // Apps already open but not signed in (their sign-in page, or
                // MIS's sign-in form inside their tab): sign them in now, behind
                // their loading screen, without waiting for the usual retry pause.
                for def in apps.iter().filter(|d| d.sso.is_some()) {
                    let Some(wv) = app.get_webview(&webviews::label(def.key)) else {
                        continue;
                    };
                    let Ok(url) = wv.url() else { continue };
                    if classify(def, &url) == Page::SignedIn {
                        continue;
                    }
                    if let Some(entry) = registry::sso_entry_url(&apps, def) {
                        log::info!("[{}] syncing the MIS sign-in", def.key);
                        webviews::mark_unready(app, def.key);
                        watch.last_resso.insert(def.key, now);
                        watch.hidden_since.insert(def.key, now);
                        let _ = wv.navigate(entry);
                    }
                }
            }
            Some(MisChange::SignedOut) => {
                log::info!("MIS signed out ({mis_url}): closing the other apps");
                webviews::close_spokes(app);
                webviews::forget_sso(app);
                SIGNED_IN_APPS.lock().unwrap().clear();
                watch.seen.retain(|k, _| *k == mis_key);
                let _ = app.emit_to(webviews::SHELL, "nga://auth", false);
                return;
            }
            None => {}
        }
    }

    if watch.mis != Some(true) {
        return;
    }
    for def in apps.iter().filter(|d| d.sso.is_some()) {
        let Some((page, url)) = stable.get(def.key) else {
            continue;
        };
        let stuck = *page == Page::SignedOut
            || (*page == Page::Elsewhere && parked_on_mis_login(&apps, url));
        if !stuck {
            continue;
        }
        if watch
            .last_resso
            .get(def.key)
            .is_some_and(|t| now.duration_since(*t) < RESSO_EVERY)
        {
            continue;
        }
        watch.last_resso.insert(def.key, now);
        if let (Some(wv), Some(entry)) = (
            app.get_webview(&webviews::label(def.key)),
            registry::sso_entry_url(&apps, def),
        ) {
            log::info!(
                "[{}] signed out while MIS is signed in: signing in again",
                def.key
            );
            let _ = wv.navigate(entry);
        }
    }
}

/// Create the spokes that aren't open yet, hidden, one second apart.
fn warm_spokes<R: Runtime>(app: &AppHandle<R>, apps: &[AppDef]) {
    let missing: Vec<&'static str> = apps
        .iter()
        .filter(|d| d.sso.is_some() && app.get_webview(&webviews::label(d.key)).is_none())
        .map(|d| d.key)
        .collect();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        for key in missing {
            tokio::time::sleep(Duration::from_secs(1)).await;
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Err(e) = webviews::ensure_app(&handle, key) {
                    log::warn!("[{key}] background sign-in failed: {e}");
                }
            });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::{apps_for, find, Env};

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn classifies_each_apps_pages() {
        let apps = apps_for(Env::Production);
        let mis = find(&apps, "mis").unwrap();
        assert_eq!(
            classify(mis, &u("https://mis.amashuri.com/home")),
            Page::SignedIn
        );
        assert_eq!(
            classify(mis, &u("https://mis.amashuri.com/login")),
            Page::SignedOut
        );
        assert_eq!(
            classify(
                mis,
                &u("https://mis.amashuri.com/login?client_id=tupo&redirect_uri=x")
            ),
            Page::Neutral
        );
        assert_eq!(
            classify(mis, &u("https://mis.amashuri.com/apps")),
            Page::Neutral
        );
        assert_eq!(
            classify(mis, &u("https://mis.amashuri.com/desktop/google")),
            Page::Neutral
        );

        let tendo = find(&apps, "tendo").unwrap();
        assert_eq!(
            classify(tendo, &u("https://tendo.amashuri.com/")),
            Page::SignedOut
        );
        assert_eq!(
            classify(tendo, &u("https://tendo.amashuri.com/attendance")),
            Page::SignedIn
        );
        assert_eq!(
            classify(tendo, &u("https://tendo.amashuri.com/sso/callback?code=x")),
            Page::Neutral
        );
        assert_eq!(
            classify(tendo, &u("https://mis.amashuri.com/login?client_id=x")),
            Page::Elsewhere
        );

        let tupo = find(&apps, "tupo").unwrap();
        assert_eq!(
            classify(tupo, &u("https://tupo.amashuri.com/app/chat")),
            Page::SignedIn
        );
        assert_eq!(
            classify(tupo, &u("https://tupo.amashuri.com/meet/abc")),
            Page::Neutral
        );

        let tm = find(&apps, "taskmentor").unwrap();
        assert_eq!(
            classify(tm, &u("https://taskmentor.amashuri.com/login")),
            Page::SignedOut
        );
        assert_eq!(
            classify(tm, &u("https://taskmentor.amashuri.com/dashboard")),
            Page::SignedIn
        );
    }

    #[test]
    fn dev_base_path_is_ignored() {
        let apps = apps_for(Env::Development);
        let tm = find(&apps, "taskmentor").unwrap();
        assert_eq!(
            classify(tm, &u("http://localhost:5174/taskmentor/login")),
            Page::SignedOut
        );
        assert_eq!(
            classify(tm, &u("http://localhost:5174/taskmentor/dashboard")),
            Page::SignedIn
        );
    }

    #[test]
    fn spokes_stay_hidden_during_the_sso_hop() {
        let apps = apps_for(Env::Production);
        let tupo = find(&apps, "tupo").unwrap();
        let mis = find(&apps, "mis").unwrap();
        assert!(shows_immediately(
            tupo,
            &u("https://tupo.amashuri.com/app/chat")
        ));
        assert!(!shows_immediately(
            tupo,
            &u("https://mis.amashuri.com/login?client_id=tupo&redirect_uri=x")
        ));
        assert!(!shows_immediately(
            tupo,
            &u("https://tupo.amashuri.com/sso/callback?code=x")
        ));
        assert!(!shows_immediately(tupo, &u("https://tupo.amashuri.com/")));
        assert!(shows_immediately(
            tupo,
            &u("https://tupo.amashuri.com/meet/abc")
        ));
        assert!(shows_immediately(mis, &u("https://mis.amashuri.com/login")));
        let s = Duration::from_secs;
        // The hop in progress: hidden.
        assert!(!reveal(false, Page::Elsewhere, false, s(2), s(2)));
        assert!(!reveal(false, Page::Neutral, true, s(3), s(5)));
        // On MIS's sign-in form inside the app's tab: never (one sign-in, in MIS).
        assert!(!reveal(false, Page::Elsewhere, false, s(30), s(60)));
        // The app's own sign-in page held: shown so the person can act.
        assert!(reveal(false, Page::SignedOut, false, s(4), s(6)));
        // Anything else: never longer than 20 s.
        assert!(reveal(false, Page::Neutral, true, s(1), s(20)));
    }

    #[test]
    fn mis_transitions() {
        assert_eq!(
            mis_change(None, Page::SignedIn),
            (Some(true), Some(MisChange::SignedIn))
        );
        assert_eq!(mis_change(Some(true), Page::SignedIn), (Some(true), None));
        assert_eq!(
            mis_change(Some(true), Page::SignedOut),
            (Some(false), Some(MisChange::SignedOut))
        );
        // A signed-out first sighting is not a sign-out event (nothing to close).
        assert_eq!(mis_change(None, Page::SignedOut), (Some(false), None));
        assert_eq!(
            mis_change(Some(false), Page::SignedIn),
            (Some(true), Some(MisChange::SignedIn))
        );
        assert_eq!(mis_change(Some(true), Page::Neutral), (Some(true), None));
    }

    #[test]
    fn spoke_waiting_on_mis_login_is_detected() {
        let apps = apps_for(Env::Production);
        assert!(parked_on_mis_login(
            &apps,
            &u("https://mis.amashuri.com/login?client_id=tupo&redirect_uri=x")
        ));
        assert!(!parked_on_mis_login(
            &apps,
            &u("https://mis.amashuri.com/login")
        ));
    }
}
