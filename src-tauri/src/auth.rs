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

const TICK: Duration = Duration::from_millis(1500);
/// How long a page must hold before we believe it. "Signed in" needs longer:
/// MIS first shows /home from a cached token, and only then checks the session
/// with the server and may move to /login.
const STABLE: Duration = Duration::from_secs(3);
const STABLE_SIGNED_IN: Duration = Duration::from_secs(6);
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
            continue;
        };
        let Ok(url) = wv.url() else { continue };
        let page = classify(def, &url);
        let since = match watch.seen.get(def.key) {
            Some((p, t)) if *p == page => *t,
            _ => {
                watch.seen.insert(def.key, (page, now));
                now
            }
        };
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
        match change {
            Some(MisChange::SignedIn) => {
                log::info!("MIS signed in ({mis_url})");
                let _ = app.emit_to(webviews::SHELL, "nga://auth", true);
                if background_sign_in(app) {
                    warm_spokes(app, &apps);
                }
            }
            Some(MisChange::SignedOut) => {
                log::info!("MIS signed out ({mis_url}): closing the other apps");
                webviews::close_spokes(app);
                webviews::forget_sso(app);
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
