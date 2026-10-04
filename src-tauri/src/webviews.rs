//! One native window: the local shell webview (sidebar + header) and one child
//! webview per NGA app, each a real top-level page on its own origin so its
//! cookies and localStorage are first-party, exactly as in a browser tab.
//! All child webviews share the default data store (one browser profile), so
//! a MIS sign-in is seen by the SSO hops of every spoke.
//!
//! This is the only module that uses Tauri's `unstable` multi-webview API.

use crate::navigation::{self, Frame, NewWindow};
use crate::registry::{self, AppDef, Env};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Rect, Runtime, Url, Webview,
    WebviewUrl, WebviewWindowBuilder, Window,
};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_store::StoreExt;

pub const WINDOW: &str = "main";
pub const SHELL: &str = "shell";
const SESSION_STORE: &str = "session.json";
/// MIS JWTs last 24 h; re-run the SSO hop before a spoke's token can expire.
const SSO_FRESH_SECS: u64 = 20 * 60 * 60;

pub fn label(key: &str) -> String {
    format!("app-{key}")
}

fn key_of(label: &str) -> Option<&str> {
    label.strip_prefix("app-")
}

#[derive(Default)]
struct Inner {
    active: Option<String>,
    /// Space the shell UI takes (sidebar on the left, header on top), logical px.
    inset_left: f64,
    inset_top: f64,
    /// A side panel (notifications) on the right pushes the app instead of covering it.
    inset_right: f64,
    inset_bottom: f64,
    /// A shell page (Settings, About, offline…) covers the viewport: hide apps.
    covered: bool,
    /// Apps whose first page has finished loading (shown only from then on).
    ready: HashSet<String>,
    /// Last allowed top-level URL per app, to return to after a blocked page.
    last_good: HashMap<String, Url>,
    popups: u32,
    /// Page zoom per app (1.0 = 100 %).
    zoom: HashMap<String, f64>,
    /// Current page title per app (for the window title).
    titles: HashMap<String, String>,
    /// An app page is in element fullscreen (Windows): it fills the window.
    fullscreen: bool,
}

pub struct Shell {
    pub env: Env,
    pub apps: Vec<AppDef>,
    inner: Mutex<Inner>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppEvent {
    pub key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadDone {
    pub success: bool,
    pub path: Option<String>,
}

impl Shell {
    pub fn new() -> Self {
        let env = registry::current_env();
        Self {
            env,
            apps: registry::apps_for(env),
            inner: Mutex::new(Inner::default()),
        }
    }

    pub fn active(&self) -> Option<String> {
        self.inner.lock().unwrap().active.clone()
    }
}

/// URL for logs: no query or fragment (SSO codes and states stay out of log files).
pub fn redact(url: &Url) -> String {
    format!("{}{}", url.origin().ascii_serialization(), url.path())
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn emit<R: Runtime, S: Serialize + Clone>(app: &AppHandle<R>, event: &str, payload: S) {
    let _ = app.emit_to(SHELL, event, payload);
}

/// The viewport rect (logical px) the active app occupies.
/// The window's content size. Read it BEFORE locking `Shell::inner`: off the
/// main thread, window calls wait for the main thread, which may itself be
/// waiting for that lock (a sync command) — a deadlock.
fn window_size<R: Runtime>(window: &Window<R>) -> Option<LogicalSize<f64>> {
    let scale = window.scale_factor().ok()?;
    Some(window.inner_size().ok()?.to_logical::<f64>(scale))
}

fn viewport(size: LogicalSize<f64>, inner: &Inner) -> Rect {
    if inner.fullscreen {
        return Rect {
            position: LogicalPosition::new(0.0, 0.0).into(),
            size: LogicalSize::new(size.width, size.height).into(),
        };
    }
    Rect {
        position: LogicalPosition::new(inner.inset_left, inner.inset_top).into(),
        size: LogicalSize::new(
            (size.width - inner.inset_left - inner.inset_right).max(0.0),
            (size.height - inner.inset_top - inner.inset_bottom).max(0.0),
        )
        .into(),
    }
}

/// Position every app webview and show only the active one (if ready and not covered).
pub fn relayout<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_window(WINDOW) else {
        return;
    };
    let Some(size) = window_size(&window) else {
        return;
    };
    let shell = app.state::<Shell>();
    // Decide under the lock, move the webviews after it (see `window_size`).
    let (rect, plan): (Rect, Vec<(&str, bool)>) = {
        let inner = shell.inner.lock().unwrap();
        let plan = shell
            .apps
            .iter()
            .map(|a| {
                let visible = inner.active.as_deref() == Some(a.key)
                    && !inner.covered
                    && inner.ready.contains(a.key);
                (a.key, visible)
            })
            .collect();
        (viewport(size, &inner), plan)
    };
    for (key, visible) in plan {
        if let Some(wv) = app.get_webview(&label(key)) {
            let _ = wv.set_bounds(rect);
            let _ = if visible { wv.show() } else { wv.hide() };
        }
    }
}

pub fn set_insets<R: Runtime>(app: &AppHandle<R>, left: f64, top: f64, right: f64, bottom: f64) {
    {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        inner.inset_left = left.max(0.0);
        inner.inset_top = top.max(0.0);
        inner.inset_right = right.max(0.0);
        inner.inset_bottom = bottom.max(0.0);
    }
    relayout(app);
}

pub fn set_covered<R: Runtime>(app: &AppHandle<R>, covered: bool) {
    app.state::<Shell>().inner.lock().unwrap().covered = covered;
    relayout(app);
}

/// The first URL for an app: spokes go through MIS's SSO login unless they
/// completed the handshake recently (then their own token is still valid).
fn initial_url<R: Runtime>(app: &AppHandle<R>, def: &AppDef, apps: &[AppDef]) -> Url {
    if def.sso.is_some() {
        let fresh = app
            .store(SESSION_STORE)
            .ok()
            .and_then(|s| s.get(format!("sso.{}", def.key)))
            .and_then(|v| v.as_u64())
            .is_some_and(|at| now_secs().saturating_sub(at) < SSO_FRESH_SECS);
        if !fresh {
            if let Some(url) = registry::sso_entry_url(apps, def) {
                return url;
            }
        }
    }
    def.start_url()
}

fn mark_sso_done<R: Runtime>(app: &AppHandle<R>, key: &str) {
    if let Ok(store) = app.store(SESSION_STORE) {
        store.set(format!("sso.{key}"), now_secs());
        let _ = store.save();
    }
    // The person signed in to MIS from inside a spoke's tab: the MIS tab is
    // still showing its sign-in page, so take it home.
    let shell = app.state::<Shell>();
    let mis = registry::identity_provider(&shell.apps);
    if let Some(wv) = app.get_webview(&label(mis.key)) {
        if wv
            .url()
            .is_ok_and(|u| crate::auth::classify(mis, &u) == crate::auth::Page::SignedOut)
        {
            let _ = wv.navigate(mis.start_url());
        }
    }
}

pub fn forget_sso<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(store) = app.store(SESSION_STORE) {
        store.clear();
        let _ = store.save();
    }
}

/// Create `key`'s webview (hidden) if it doesn't exist yet, without switching to it.
/// Used for background sign-in.
pub fn ensure_app<R: Runtime>(app: &AppHandle<R>, key: &str) -> tauri::Result<()> {
    if app.get_webview(&label(key)).is_some() {
        return Ok(());
    }
    let shell = app.state::<Shell>();
    let def = registry::find(&shell.apps, key)
        .ok_or(tauri::Error::WebviewNotFound)?
        .clone();
    let target = initial_url(app, &def, &shell.apps);
    create_later(app, def, target);
    Ok(())
}

/// Apps whose webview is being created (so two quick requests make one).
static CREATING: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Creates an app's webview on a worker thread, never inline.
///
/// On Windows, creating a WebView2 waits for the main thread's message loop.
/// Called from inside a WebView2 callback (a sync IPC command from the shell,
/// a link's new-window request, a page-load handler) that wait never ends:
/// the app froze on its first tab. From a worker, Tauri hands the creation
/// to the main thread and the callback returns first. Same on macOS, harmlessly.
fn create_later<R: Runtime>(app: &AppHandle<R>, def: AppDef, url: Url) {
    {
        let mut creating = CREATING.lock().unwrap();
        if creating.iter().any(|k| k == def.key) {
            return;
        }
        creating.push(def.key.to_string());
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if app.get_webview(&label(def.key)).is_none() {
            match create_app_webview(&app, &def, url) {
                Ok(_) => relayout(&app),
                Err(e) => log::warn!("[{}] couldn't create its view: {e}", def.key),
            }
        }
        CREATING.lock().unwrap().retain(|k| k != def.key);
    });
}

/// Switch to `key`, creating its webview on first use. `url` overrides where it goes.
pub fn open_app<R: Runtime>(app: &AppHandle<R>, key: &str, url: Option<Url>) -> tauri::Result<()> {
    log::info!(
        "[{key}] opened{}",
        if url.is_some() { " (with a page)" } else { "" }
    );
    let shell = app.state::<Shell>();
    let def = registry::find(&shell.apps, key)
        .ok_or_else(|| tauri::Error::WebviewNotFound)?
        .clone();
    {
        let mut inner = shell.inner.lock().unwrap();
        inner.active = Some(def.key.to_string());
        inner.covered = false;
    }
    if app
        .state::<crate::notifications::Notifier>()
        .mark_app_read(def.key)
    {
        crate::notifications::publish(app);
    }
    match app.get_webview(&label(def.key)) {
        Some(wv) => {
            if let Some(url) = url {
                wv.navigate(url)?;
            }
            relayout(app);
            let _ = wv.set_focus();
        }
        None => {
            let target = url.unwrap_or_else(|| initial_url(app, &def, &shell.apps));
            create_later(app, def.clone(), target);
        }
    }
    let page_title = shell.inner.lock().unwrap().titles.get(def.key).cloned();
    set_window_title(app, def.key, page_title.as_deref());
    emit(
        app,
        "nga://active",
        AppEvent {
            key: def.key.into(),
            url: None,
            title: None,
        },
    );
    Ok(())
}

fn user_agent() -> String {
    let suffix = format!("NGADesktop/{}", env!("CARGO_PKG_VERSION"));
    #[cfg(target_os = "macos")]
    {
        // WKWebView's default UA has no "Version/x Safari/y" tokens, which makes
        // some sites treat it as an unknown embedded browser. Present as the
        // installed Safari (same engine), plus our marker.
        let safari = std::process::Command::new("defaults")
            .args([
                "read",
                "/Applications/Safari.app/Contents/Info",
                "CFBundleShortVersionString",
            ])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "18.0".into());
        format!(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/{safari} Safari/605.1.15 {suffix}"
        )
    }
    #[cfg(not(target_os = "macos"))]
    {
        let chrome = tauri::webview_version().unwrap_or_else(|_| "140.0.0.0".into());
        let major = chrome.split('.').next().unwrap_or("140");
        format!(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36 Edg/{chrome} {suffix}"
        )
    }
}

/// What every NGA-hosting webview (app tabs and their popups) does with links,
/// new windows and downloads.
fn with_routing<R: Runtime>(
    app: &AppHandle<R>,
    builder: WebviewBuilder<R>,
    opener: &'static str,
) -> WebviewBuilder<R> {
    let nav_app = app.clone();
    let win_app = app.clone();
    builder
        .user_agent(&user_agent())
        // Pages take file drops themselves (uploads, chat attachments); Tauri's
        // own handler would swallow them (always on Windows).
        .disable_drag_drop_handler()
        .on_navigation(move |url| {
            let shell = nav_app.state::<Shell>();
            if crate::browser_signin::is_start(&shell.apps, url) {
                let app = nav_app.clone();
                let _ = nav_app.run_on_main_thread(move || crate::browser_signin::start(&app));
                return false;
            }
            frame_rule(&nav_app, url)
        })
        .on_new_window(move |url, features| route_new_window(&win_app, url, features, opener))
        .on_download(|wv, event| {
            if let DownloadEvent::Finished { path, success, .. } = event {
                let path = path.map(|p| p.display().to_string());
                emit(
                    wv.app_handle(),
                    "nga://download",
                    DownloadDone { success, path },
                );
            }
            // WebView2 and wry (macOS) already save to ~/Downloads with a unique name.
            true
        })
}

/// Open a URL in the default browser, once: pages and Google's script often
/// fire the same window.open twice in a row, which opened two browser tabs.
pub fn open_external<R: Runtime>(app: &AppHandle<R>, url: &Url) {
    static LAST: Mutex<Option<(String, std::time::Instant)>> = Mutex::new(None);
    {
        let mut last = LAST.lock().unwrap();
        if last.as_ref().is_some_and(|(u, t)| {
            u == url.as_str() && t.elapsed() < std::time::Duration::from_secs(3)
        }) {
            return;
        }
        *last = Some((url.to_string(), std::time::Instant::now()));
    }
    let _ = app.opener().open_url(url.as_str(), None::<&str>);
}

fn frame_rule<R: Runtime>(app: &AppHandle<R>, url: &Url) -> bool {
    match navigation::frame_navigation(url) {
        Frame::Allow => true,
        Frame::OpenWithOs(url) => {
            let _ = app.opener().open_url(url.as_str(), None::<&str>);
            false
        }
        Frame::Block => false,
    }
}

fn route_new_window<R: Runtime>(
    app: &AppHandle<R>,
    url: Url,
    features: tauri::webview::NewWindowFeatures,
    opener: &'static str,
) -> NewWindowResponse<R> {
    let shell = app.state::<Shell>();
    if crate::browser_signin::is_start(&shell.apps, &url) {
        let app = app.clone();
        let _ = app
            .clone()
            .run_on_main_thread(move || crate::browser_signin::start(&app));
        return NewWindowResponse::Deny;
    }
    match navigation::new_window_from(shell.env, &shell.apps, Some(opener), &url) {
        NewWindow::App(key, url) => {
            log::info!("new window → {key} tab: {}", redact(&url));
            // Switch tabs on the main thread; this callback may hold engine locks.
            let app = app.clone();
            let key = key.to_string();
            let _ = app.clone().run_on_main_thread(move || {
                let _ = open_app(&app, &key, Some(url));
            });
            NewWindowResponse::Deny
        }
        NewWindow::External(url) => {
            open_external(app, &url);
            NewWindowResponse::Deny
        }
        NewWindow::GoogleSignIn => {
            log::info!("Google sign-in popup → NGA's browser sign-in");
            let app = app.clone();
            let _ = app
                .clone()
                .run_on_main_thread(move || crate::browser_signin::start(&app));
            NewWindowResponse::Deny
        }
        NewWindow::Block => NewWindowResponse::Deny,
        NewWindow::Popup => match create_popup(app, &url, features, opener) {
            Ok(window) => NewWindowResponse::Create { window },
            Err(e) => {
                log::warn!("popup for {url} failed: {e}");
                NewWindowResponse::Deny
            }
        },
    }
}

/// A real secondary window sharing the session (PDF/blob previews, a script
/// that opens about:blank and then points it somewhere). If it heads to an
/// NGA app or an outside site, it is routed like a link and closed.
fn create_popup<R: Runtime>(
    app: &AppHandle<R>,
    url: &Url,
    features: tauri::webview::NewWindowFeatures,
    opener: &'static str,
) -> tauri::Result<tauri::WebviewWindow<R>> {
    let n = {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        inner.popups += 1;
        inner.popups
    };
    let label = format!("popup-{n}");
    let guard_app = app.clone();
    let builder = WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::External("about:blank".parse().unwrap()),
    )
    .title(url.as_str())
    .inner_size(1000.0, 760.0)
    .disable_drag_drop_handler()
    .window_features(features)
    .additional_browser_args(&registry::browser_args())
    .user_agent(&user_agent())
    .on_document_title_changed(|w, title| {
        let _ = w.set_title(&title);
    })
    .on_page_load(move |w, payload| {
        if !matches!(payload.event(), PageLoadEvent::Started) {
            return;
        }
        let url = payload.url().clone();
        let shell = guard_app.state::<Shell>();
        let routed = match navigation::new_window_from(shell.env, &shell.apps, Some(opener), &url) {
            NewWindow::App(key, url) => {
                let _ = open_app(&guard_app, key, Some(url));
                true
            }
            NewWindow::External(url) => {
                open_external(&guard_app, &url);
                true
            }
            NewWindow::GoogleSignIn => {
                crate::browser_signin::start(&guard_app);
                true
            }
            NewWindow::Block => true,
            NewWindow::Popup => false,
        };
        if routed {
            let _ = w.close();
        }
    })
    .on_download(|wv, event| {
        if let DownloadEvent::Finished { path, success, .. } = event {
            let path = path.map(|p| p.display().to_string());
            emit(
                wv.app_handle(),
                "nga://download",
                DownloadDone { success, path },
            );
        }
        true
    });
    let window = builder.build()?;
    crate::dialogs::install(&window.as_ref().clone());
    Ok(window)
}

fn create_app_webview<R: Runtime>(
    app: &AppHandle<R>,
    def: &AppDef,
    url: Url,
) -> tauri::Result<Webview<R>> {
    let window = app.get_window(WINDOW).ok_or(tauri::Error::WindowNotFound)?;
    let size = window_size(&window).ok_or(tauri::Error::WindowNotFound)?;
    let rect = {
        let shell = app.state::<Shell>();
        let inner = shell.inner.lock().unwrap();
        viewport(size, &inner)
    };
    let load_app = app.clone();
    let title_app = app.clone();
    let builder = WebviewBuilder::new(label(def.key), WebviewUrl::External(url))
        .additional_browser_args(&registry::browser_args())
        // Notification / setAppBadge / print bridge (see bridge.js).
        .initialization_script(bridge_script(def.key))
        // Hidden apps keep their sockets and timers running, so Tupo chat and
        // reminders still arrive while another app is on screen.
        .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
        .on_page_load(move |wv, payload| {
            on_page_load(&load_app, &wv, payload.event(), payload.url())
        })
        .on_document_title_changed(move |wv, title| {
            if let Some(key) = key_of(wv.label()) {
                let shell = title_app.state::<Shell>();
                shell
                    .inner
                    .lock()
                    .unwrap()
                    .titles
                    .insert(key.to_string(), title.clone());
                if shell.active().as_deref() == Some(key) {
                    set_window_title(&title_app, key, Some(&title));
                }
                emit(
                    &title_app,
                    "nga://title",
                    AppEvent {
                        key: key.into(),
                        url: None,
                        title: Some(title),
                    },
                );
            }
        });
    let builder = with_routing(app, builder, def.key);
    let webview = window.add_child(builder, rect.position, rect.size)?;
    let _ = webview.hide();
    crate::dialogs::install(&webview);
    Ok(webview)
}

fn on_page_load<R: Runtime>(app: &AppHandle<R>, wv: &Webview<R>, event: PageLoadEvent, url: &Url) {
    let Some(key) = key_of(wv.label()).map(str::to_string) else {
        return;
    };
    let shell = app.state::<Shell>();
    match event {
        PageLoadEvent::Started => {
            log::info!("[{key}] loading {}", redact(url));
            if !navigation::main_frame_allowed(shell.env, &shell.apps, url) {
                // A top-level page outside NGA: open it in the browser and go back.
                if navigation::is_google_signin(url) {
                    log::info!("[{key}] Google sign-in page → NGA's browser sign-in");
                    crate::browser_signin::start(app);
                } else {
                    log::info!("[{key}] outside NGA, sent to browser: {}", redact(url));
                    open_external(app, url);
                }
                let back = shell.inner.lock().unwrap().last_good.get(&key).cloned();
                let back = back.unwrap_or_else(|| {
                    registry::find(&shell.apps, &key)
                        .map(|d| d.start_url())
                        .expect("known app")
                });
                let _ = wv.navigate(back);
                return;
            }
            if let Some(def) = registry::find(&shell.apps, &key) {
                if def.sso.is_some() {
                    // "Sign out" pressed inside the app (it only signs itself out
                    // and loads its sign-in page): with one NGA sign-in, that
                    // means signing out of NGA. Otherwise NGA would just sign it
                    // straight back in through MIS.
                    if crate::auth::classify(def, url) == crate::auth::Page::SignedOut
                        && crate::auth::was_signed_in(&key)
                        && crate::auth::mis_signed_in() == Some(true)
                    {
                        log::info!("[{key}] signed out in the app: signing out of NGA");
                        tauri::async_runtime::spawn(crate::auth::sign_out_everywhere(
                            app.clone(),
                            false,
                        ));
                    }
                    // Through the sign-in handshake again (MIS just signed in, a
                    // session expired): behind the loading screen until it lands.
                    if !crate::auth::shows_immediately(def, url) {
                        mark_unready(app, &key);
                    }
                }
            }
            emit(
                app,
                "nga://loading",
                AppEvent {
                    key,
                    url: Some(url.to_string()),
                    title: None,
                },
            );
        }
        PageLoadEvent::Finished => {
            crate::theme::on_page_loaded(app, wv);
            if registry::identity_provider(&shell.apps).key == key {
                crate::browser_signin::on_mis_page(app, url);
            }
            log::info!("[{key}] loaded {}", redact(url));
            let def = registry::find(&shell.apps, &key);
            // The spoke's own /sso/callback?code= was reached: the MIS hop worked.
            if let Some(def) = def {
                let is_callback = def.callback_url().is_some_and(|cb| {
                    cb.origin() == url.origin()
                        && cb.path() == url.path()
                        && url.query_pairs().any(|(k, _)| k == "code")
                });
                if is_callback {
                    mark_sso_done(app, &key);
                }
            }
            // A signed-in app shows only once it is on its own signed-in page:
            // the SSO hop (MIS's sign-in screen, the app's "verifying" page)
            // stays behind the loading screen. auth.rs reveals it later if the
            // person really has to sign in.
            let showable = def.is_none_or(|d| crate::auth::shows_immediately(d, url));
            let (first, ready) = {
                let mut inner = shell.inner.lock().unwrap();
                if navigation::main_frame_allowed(shell.env, &shell.apps, url)
                    && url.scheme() != "about"
                {
                    inner.last_good.insert(key.clone(), url.clone());
                }
                let first = showable && inner.ready.insert(key.clone());
                (first, inner.ready.contains(&key))
            };
            if first {
                relayout(app);
            }
            if !ready {
                return;
            }
            emit(
                app,
                "nga://loaded",
                AppEvent {
                    key,
                    url: Some(url.to_string()),
                    title: None,
                },
            );
        }
    }
}

pub fn is_ready<R: Runtime>(app: &AppHandle<R>, key: &str) -> bool {
    app.state::<Shell>()
        .inner
        .lock()
        .unwrap()
        .ready
        .contains(key)
}

/// Show an app that was kept hidden while it signed in (auth.rs decides when).
pub fn mark_ready<R: Runtime>(app: &AppHandle<R>, key: &str, url: &Url) {
    if !app
        .state::<Shell>()
        .inner
        .lock()
        .unwrap()
        .ready
        .insert(key.to_string())
    {
        return;
    }
    relayout(app);
    emit(
        app,
        "nga://loaded",
        AppEvent {
            key: key.into(),
            url: Some(url.to_string()),
            title: None,
        },
    );
}

/// Runs `fix` and re-lays out twice, after the window's own fullscreen
/// transition has settled (it reports sizes and views late).
fn settle<R: Runtime>(app: AppHandle<R>, fix: impl Fn(&AppHandle<R>) + Send + 'static) {
    std::thread::spawn(move || {
        for ms in [400, 1200] {
            std::thread::sleep(std::time::Duration::from_millis(ms));
            fix(&app);
            relayout(&app);
        }
    });
}

/// An app page entered or left element fullscreen (bridge.js).
/// - Windows: WebView2 would show it inside the app area only, so the window
///   goes fullscreen and the app's view covers all of it.
/// - macOS: WebKit does it natively; NGA only restores the view afterwards.
#[tauri::command]
pub async fn web_fullscreen<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    on: bool,
) -> Result<(), String> {
    if !webview.label().starts_with("app-") {
        return Ok(());
    }
    let label = webview.label().to_string();
    if cfg!(target_os = "macos") {
        // WebKit does fullscreen itself, but on the way out it puts the app's
        // view back at the BOTTOM of the window: under the shell's
        // full-window view, so the page showed another app and took no
        // clicks (found by the CI probe after a Task Mentor-style quiz).
        // Put it back on top once WebKit's exit animation is done.
        if !on {
            settle(app, move |app| {
                if let (Some(wv), Some(w)) = (app.get_webview(&label), app.get_window(WINDOW)) {
                    let _ = wv.reparent(&w);
                }
            });
        }
        return Ok(());
    }
    app.state::<Shell>().inner.lock().unwrap().fullscreen = on;
    if let Some(w) = app.get_window(WINDOW) {
        let _ = w.set_fullscreen(on);
    }
    // The window reports its new size a moment later (the view was left
    // 48 px short of the screen: the taskbar's height).
    settle(app, |_| {});
    Ok(())
}

/// Hide an app behind its loading screen while it signs in (again).
pub fn mark_unready<R: Runtime>(app: &AppHandle<R>, key: &str) {
    if !app.state::<Shell>().inner.lock().unwrap().ready.remove(key) {
        return;
    }
    log::info!("[{key}] signing in: hidden behind the loading screen");
    relayout(app);
    emit(app, "nga://syncing", key.to_string());
}

pub fn active_webview<R: Runtime>(app: &AppHandle<R>) -> Option<Webview<R>> {
    let key = app.state::<Shell>().active()?;
    app.get_webview(&label(&key))
}

/// Reload the active app, or re-run its first load if it never finished
/// (offline at start: the page it failed on may be a dead SSO code).
pub fn reload_active<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let Some(key) = app.state::<Shell>().active() else {
        return Ok(());
    };
    let Some(wv) = app.get_webview(&label(&key)) else {
        return Ok(());
    };
    let shell = app.state::<Shell>();
    let ready = shell.inner.lock().unwrap().ready.contains(&key);
    if ready {
        wv.reload()
    } else {
        let def = registry::find(&shell.apps, &key)
            .expect("known app")
            .clone();
        wv.navigate(initial_url(app, &def, &shell.apps))
    }
}

/// "Tupo — Chat" in the Dock, taskbar, Mission Control and Alt+Tab.
pub fn set_window_title<R: Runtime>(app: &AppHandle<R>, key: &str, page: Option<&str>) {
    let Some(window) = app.get_window(WINDOW) else {
        return;
    };
    let shell = app.state::<Shell>();
    let name = registry::find(&shell.apps, key)
        .map(|d| d.name)
        .unwrap_or("NGA");
    let title = match page.map(str::trim).filter(|t| !t.is_empty() && *t != name) {
        Some(p) => format!("{name} — {p}"),
        None => name.to_string(),
    };
    let _ = window.set_title(&title);
}

fn bridge_script(key: &str) -> String {
    let platform = if cfg!(target_os = "macos") {
        "macos"
    } else {
        "other"
    };
    include_str!("bridge.js")
        .replace("__NGA_PLATFORM__", &format!("\"{platform}\""))
        .replace("__NGA_APP__", &format!("\"{key}\""))
}

/// Go to a page inside an app (command palette, quick destinations).
pub fn navigate_app<R: Runtime>(app: &AppHandle<R>, key: &str, path: &str) -> tauri::Result<()> {
    let shell = app.state::<Shell>();
    let def = registry::find(&shell.apps, key).ok_or(tauri::Error::WebviewNotFound)?;
    // Only paths inside the app: no scheme, no other host.
    if !path.starts_with('/') || path.starts_with("//") {
        return Err(tauri::Error::WebviewNotFound);
    }
    let url = Url::parse(&format!("{}{}{}", def.origin, def.base, path))
        .map_err(|_| tauri::Error::WebviewNotFound)?;
    if app.get_webview(&label(key)).is_none() && def.sso.is_some() {
        // Not signed in here yet: sign in first; the destination can wait.
        return open_app(app, key, None);
    }
    open_app(app, key, Some(url))
}

/// Close the spokes only (MIS signed out: their sessions ended with it).
pub fn close_spokes<R: Runtime>(app: &AppHandle<R>) {
    let shell = app.state::<Shell>();
    let mut closed = Vec::new();
    for a in shell.apps.iter().filter(|a| a.sso.is_some()) {
        if let Some(wv) = app.get_webview(&label(a.key)) {
            let _ = wv.close();
            closed.push(a.key.to_string());
        }
    }
    {
        let mut inner = shell.inner.lock().unwrap();
        for k in &closed {
            inner.ready.remove(k);
            inner.last_good.remove(k);
        }
        if inner.active.as_ref().is_some_and(|a| closed.contains(a)) {
            inner.active = None;
        }
    }
    emit(app, "nga://closed", closed);
}

/// Zoom the active app: `step` +1 / -1, or 0 to reset. Remembered per app.
pub fn zoom_active<R: Runtime>(app: &AppHandle<R>, step: i32) {
    let Some(key) = app.state::<Shell>().active() else {
        return;
    };
    let Some(wv) = app.get_webview(&label(&key)) else {
        return;
    };
    let shell = app.state::<Shell>();
    let level = {
        let mut inner = shell.inner.lock().unwrap();
        let cur = inner.zoom.get(&key).copied().unwrap_or(1.0);
        let next = match step {
            0 => 1.0,
            s if s > 0 => (cur + 0.1).min(2.0),
            _ => (cur - 0.1).max(0.5),
        };
        inner.zoom.insert(key, next);
        next
    };
    let _ = wv.set_zoom(level);
}

/// Close every app webview and forget which were ready (after sign-out/reset).
pub fn close_all_apps<R: Runtime>(app: &AppHandle<R>) {
    let shell = app.state::<Shell>();
    for a in &shell.apps {
        if let Some(wv) = app.get_webview(&label(a.key)) {
            let _ = wv.close();
        }
    }
    let mut inner = shell.inner.lock().unwrap();
    inner.ready.clear();
    inner.last_good.clear();
    inner.active = None;
}
