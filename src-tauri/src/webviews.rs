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
    /// A shell page (Settings, About, offline…) covers the viewport: hide apps.
    covered: bool,
    /// Apps whose first page has finished loading (shown only from then on).
    ready: HashSet<String>,
    /// Last allowed top-level URL per app, to return to after a blocked page.
    last_good: HashMap<String, Url>,
    popups: u32,
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
fn viewport<R: Runtime>(window: &Window<R>, inner: &Inner) -> Option<Rect> {
    let scale = window.scale_factor().ok()?;
    let size = window.inner_size().ok()?.to_logical::<f64>(scale);
    Some(Rect {
        position: LogicalPosition::new(inner.inset_left, inner.inset_top).into(),
        size: LogicalSize::new(
            (size.width - inner.inset_left).max(0.0),
            (size.height - inner.inset_top).max(0.0),
        )
        .into(),
    })
}

/// Position every app webview and show only the active one (if ready and not covered).
pub fn relayout<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_window(WINDOW) else {
        return;
    };
    let shell = app.state::<Shell>();
    let inner = shell.inner.lock().unwrap();
    let Some(rect) = viewport(&window, &inner) else {
        return;
    };
    for a in &shell.apps {
        if let Some(wv) = app.get_webview(&label(a.key)) {
            let visible = inner.active.as_deref() == Some(a.key)
                && !inner.covered
                && inner.ready.contains(a.key);
            let _ = wv.set_bounds(rect);
            let _ = if visible { wv.show() } else { wv.hide() };
        }
    }
}

pub fn set_insets<R: Runtime>(app: &AppHandle<R>, left: f64, top: f64) {
    {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        inner.inset_left = left.max(0.0);
        inner.inset_top = top.max(0.0);
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
}

pub fn forget_sso<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(store) = app.store(SESSION_STORE) {
        store.clear();
        let _ = store.save();
    }
}

/// Switch to `key`, creating its webview on first use. `url` overrides where it goes.
pub fn open_app<R: Runtime>(app: &AppHandle<R>, key: &str, url: Option<Url>) -> tauri::Result<()> {
    let shell = app.state::<Shell>();
    let def = registry::find(&shell.apps, key)
        .ok_or_else(|| tauri::Error::WebviewNotFound)?
        .clone();
    {
        let mut inner = shell.inner.lock().unwrap();
        inner.active = Some(def.key.to_string());
        inner.covered = false;
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
            create_app_webview(app, &def, target)?;
            relayout(app);
        }
    }
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
fn with_routing<R: Runtime>(app: &AppHandle<R>, builder: WebviewBuilder<R>) -> WebviewBuilder<R> {
    let nav_app = app.clone();
    let win_app = app.clone();
    builder
        .user_agent(&user_agent())
        .on_navigation(move |url| match navigation::frame_navigation(url) {
            Frame::Allow => true,
            Frame::OpenWithOs(url) => {
                let _ = nav_app.opener().open_url(url.as_str(), None::<&str>);
                false
            }
            Frame::Block => false,
        })
        .on_new_window(move |url, features| route_new_window(&win_app, url, features))
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

fn route_new_window<R: Runtime>(
    app: &AppHandle<R>,
    url: Url,
    features: tauri::webview::NewWindowFeatures,
) -> NewWindowResponse<R> {
    let shell = app.state::<Shell>();
    match navigation::new_window(shell.env, &shell.apps, &url) {
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
            let _ = app.opener().open_url(url.as_str(), None::<&str>);
            NewWindowResponse::Deny
        }
        NewWindow::Block => NewWindowResponse::Deny,
        NewWindow::Popup => match create_popup(app, &url, features) {
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
    .window_features(features)
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
        let routed = match navigation::new_window(shell.env, &shell.apps, &url) {
            NewWindow::App(key, url) => {
                let _ = open_app(&guard_app, key, Some(url));
                true
            }
            NewWindow::External(url) => {
                let _ = guard_app.opener().open_url(url.as_str(), None::<&str>);
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
    let rect = {
        let shell = app.state::<Shell>();
        let inner = shell.inner.lock().unwrap();
        viewport(&window, &inner).ok_or(tauri::Error::WindowNotFound)?
    };
    let load_app = app.clone();
    let title_app = app.clone();
    let builder = WebviewBuilder::new(label(def.key), WebviewUrl::External(url))
        .on_page_load(move |wv, payload| {
            on_page_load(&load_app, &wv, payload.event(), payload.url())
        })
        .on_document_title_changed(move |wv, title| {
            if let Some(key) = key_of(wv.label()) {
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
    let builder = with_routing(app, builder);
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
                log::info!("[{key}] outside NGA, sent to browser: {}", redact(url));
                let _ = app.opener().open_url(url.as_str(), None::<&str>);
                let back = shell.inner.lock().unwrap().last_good.get(&key).cloned();
                let back = back.unwrap_or_else(|| {
                    registry::find(&shell.apps, &key)
                        .map(|d| d.start_url())
                        .expect("known app")
                });
                let _ = wv.navigate(back);
                return;
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
            let first = {
                let mut inner = shell.inner.lock().unwrap();
                if navigation::main_frame_allowed(shell.env, &shell.apps, url)
                    && url.scheme() != "about"
                {
                    inner.last_good.insert(key.clone(), url.clone());
                }
                inner.ready.insert(key.clone())
            };
            if first {
                relayout(app);
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
