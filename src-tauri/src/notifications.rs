//! The notification manager: every NGA app's notifications in one place.
//!
//! Input. The app webviews get a small bridge (`bridge.js`) that replaces
//! the web APIs they already use, or can adopt without anything desktop-
//! specific:
//! - `new Notification(title, {body, tag})` → `web_notify`
//!   (Tupo already does this when `document.hidden`),
//! - `navigator.setAppBadge(n)` / `clearAppBadge()` → `web_badge`.
//!
//! The source app comes from the calling webview's label, never from the page.
//!
//! Output, depending on where the person is looking:
//! - **The window isn't focused:** an OS banner (Windows toast / macOS
//!   Notification Center). Coming back to NGA within a few seconds counts as
//!   clicking it: the app opens and the page's `onclick` runs.
//! - **NGA is focused but on another app:** a toast in the shell header plus
//!   a sidebar badge.
//! - **The source app is on screen:** recorded as read, nothing else (the app
//!   shows its own UI).
//!
//! Every notice also lands in the shell's inbox (the header bell). Per-app
//! mute and Do Not Disturb come from `settings.json` (written by the shell UI).
//! The inbox lives in memory only, and sign-out clears it.

use crate::webviews::{self, Shell, SHELL, WINDOW};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, Runtime, Webview};
use tauri_plugin_store::StoreExt;

const KEEP: usize = 200;
const PER_MINUTE: usize = 12;
/// Coming back to NGA this soon after a banner counts as clicking it.
const CLICK_WINDOW: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub id: u64,
    pub app: String,
    pub title: String,
    pub body: String,
    #[serde(skip)]
    pub tag: String,
    /// The page's own id for this Notification object (to run its onclick).
    #[serde(skip)]
    pub web_id: String,
    pub at: u64,
    pub read: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    /// Unread notices per app.
    pub unread: HashMap<String, usize>,
    /// What each app set with navigator.setAppBadge (-1 = a dot without a number).
    pub badges: HashMap<String, i64>,
    pub total: i64,
}

#[derive(Default)]
struct Inner {
    items: VecDeque<Notice>,
    badges: HashMap<String, i64>,
    recent: HashMap<String, VecDeque<Instant>>,
    last_banner: Option<(u64, Instant)>,
    next_id: u64,
}

#[derive(Default)]
pub struct Notifier {
    inner: Mutex<Inner>,
    /// The app holding a meeting or quiz right now (set by the auth watcher's URL sampling).
    focus: Mutex<Option<String>>,
}

/// Where a new notice should surface.
#[derive(Debug, PartialEq, Eq)]
pub enum Route {
    /// The app is on screen: record as read only.
    Seen,
    /// NGA is focused but on another app: shell toast + badge.
    Toast,
    /// NGA isn't focused: OS banner.
    Banner,
    /// Muted or Do Not Disturb: inbox only.
    Quiet,
}

pub fn route(window_focused: bool, source_is_active: bool, quiet: bool) -> Route {
    if window_focused && source_is_active {
        Route::Seen
    } else if quiet {
        Route::Quiet
    } else if window_focused {
        Route::Toast
    } else {
        Route::Banner
    }
}

/// `true` when this app has sent too many notifications in the last minute.
fn over_limit(recent: &mut VecDeque<Instant>, now: Instant) -> bool {
    while recent
        .front()
        .is_some_and(|t| now.duration_since(*t) > Duration::from_secs(60))
    {
        recent.pop_front();
    }
    if recent.len() >= PER_MINUTE {
        return true;
    }
    recent.push_back(now);
    false
}

fn clip(s: &str, max: usize) -> String {
    let s = s.trim();
    if s.chars().count() <= max {
        s.to_string()
    } else {
        format!("{}…", s.chars().take(max).collect::<String>())
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn valid_web_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 32 && id.bytes().all(|b| b.is_ascii_alphanumeric())
}

/// The NGA app a calling webview belongs to, if it is one and is still on its own origin.
fn source_app<R: Runtime>(app: &AppHandle<R>, webview: &Webview<R>) -> Option<String> {
    let key = webview.label().strip_prefix("app-")?;
    let shell = app.state::<Shell>();
    let def = crate::registry::find(&shell.apps, key)?;
    let url = webview.url().ok()?;
    def.owns(&url).then(|| key.to_string())
}

pub fn is_muted<R: Runtime>(app: &AppHandle<R>, key: &str) -> bool {
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get("mutedApps"))
        .and_then(|v| v.as_array().cloned())
        .is_some_and(|list| list.iter().any(|k| k.as_str() == Some(key)))
}

/// Tab menu → "Mute Notifications". The shell's settings page reads the same list.
pub fn toggle_mute<R: Runtime>(app: &AppHandle<R>, key: &str) {
    let Ok(store) = app.store("settings.json") else {
        return;
    };
    let mut list: Vec<String> = store
        .get("mutedApps")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    if let Some(i) = list.iter().position(|k| k == key) {
        list.remove(i);
    } else {
        list.push(key.to_string());
    }
    store.set("mutedApps", list);
    let _ = store.save();
    let _ = app.emit_to(SHELL, "nga://settings-changed", ());
}

fn settings_quiet<R: Runtime>(app: &AppHandle<R>, key: &str) -> bool {
    let Ok(store) = app.store("settings.json") else {
        return false;
    };
    let muted = store
        .get("mutedApps")
        .and_then(|v| v.as_array().cloned())
        .is_some_and(|list| list.iter().any(|k| k.as_str() == Some(key)));
    let dnd = store
        .get("dndUntil")
        .and_then(|v| v.as_u64())
        .is_some_and(|until| until > now_ms());
    muted || dnd || in_focus_session(app, key)
}

/// A Tupo meeting or a Task Mentor quiz is in progress in another app:
/// hold banners from the rest (they still collect in the inbox).
fn in_focus_session<R: Runtime>(app: &AppHandle<R>, key: &str) -> bool {
    app.state::<Notifier>()
        .focus_session()
        .is_some_and(|session| session != key)
}

impl Notifier {
    pub fn focus_session(&self) -> Option<String> {
        self.focus.lock().unwrap().clone()
    }

    /// Returns true when it changed.
    pub fn set_focus_session(&self, session: Option<String>) -> bool {
        let mut cur = self.focus.lock().unwrap();
        if *cur == session {
            return false;
        }
        *cur = session;
        true
    }

    pub fn summary(&self) -> Summary {
        let inner = self.inner.lock().unwrap();
        let mut unread: HashMap<String, usize> = HashMap::new();
        for n in inner.items.iter().filter(|n| !n.read) {
            *unread.entry(n.app.clone()).or_default() += 1;
        }
        let mut total = 0i64;
        let mut keys: Vec<&String> = unread.keys().chain(inner.badges.keys()).collect();
        keys.sort();
        keys.dedup();
        for k in keys {
            let own = inner.badges.get(k).copied().unwrap_or(0).max(0);
            total += own.max(unread.get(k).copied().unwrap_or(0) as i64);
        }
        Summary {
            unread,
            badges: inner.badges.clone(),
            total,
        }
    }

    pub fn list(&self) -> Vec<Notice> {
        self.inner
            .lock()
            .unwrap()
            .items
            .iter()
            .rev()
            .cloned()
            .collect()
    }

    pub fn clear(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.items.clear();
        inner.badges.clear();
        inner.last_banner = None;
    }

    /// Opening an app reads its notices (like opening a chat reads it).
    pub fn mark_app_read(&self, key: &str) -> bool {
        let mut inner = self.inner.lock().unwrap();
        let mut changed = false;
        for n in inner.items.iter_mut().filter(|n| n.app == key && !n.read) {
            n.read = true;
            changed = true;
        }
        changed
    }

    pub fn mark_all_read(&self) {
        for n in self.inner.lock().unwrap().items.iter_mut() {
            n.read = true;
        }
    }

    fn take(&self, id: u64) -> Option<Notice> {
        let mut inner = self.inner.lock().unwrap();
        let n = inner.items.iter_mut().find(|n| n.id == id)?;
        n.read = true;
        Some(n.clone())
    }

    /// The banner shown last, if NGA was re-focused soon enough to count as a click on it.
    fn clicked_banner(&self) -> Option<u64> {
        let mut inner = self.inner.lock().unwrap();
        let (id, at) = inner.last_banner.take()?;
        (at.elapsed() <= CLICK_WINDOW).then_some(id)
    }
}

pub fn publish<R: Runtime>(app: &AppHandle<R>) {
    let summary = app.state::<Notifier>().summary();
    if let Some(w) = app.get_window(WINDOW) {
        // Dock badge on macOS (Windows has no numeric taskbar badge API).
        let _ = w.set_badge_count((summary.total > 0).then_some(summary.total));
    }
    if let Some(tray) = app.tray_by_id("nga") {
        let tip = if summary.total > 0 {
            format!("NGA: {} new", summary.total)
        } else {
            "NGA".into()
        };
        let _ = tray.set_tooltip(Some(tip));
    }
    let _ = app.emit_to(SHELL, "nga://notices", summary);
}

/// Open the app a notice came from and run the page's onclick for it.
pub fn open_notice<R: Runtime>(app: &AppHandle<R>, id: u64) {
    let Some(n) = app.state::<Notifier>().take(id) else {
        return;
    };
    let _ = webviews::open_app(app, &n.app, None);
    if let Some(wv) = app.get_webview(&webviews::label(&n.app)) {
        if valid_web_id(&n.web_id) {
            let _ = wv.eval(format!(
                "window.__ngaNotificationClick && window.__ngaNotificationClick('{}')",
                n.web_id
            ));
        }
    }
    publish(app);
}

/// Set when NGA itself hands focus back to the main window (overlay closed),
/// so that isn't mistaken for a click on a banner.
pub static INTERNAL_FOCUS: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// The main window gained focus: if a banner was just shown, treat it as clicked.
pub fn on_focus<R: Runtime>(app: &AppHandle<R>) {
    if INTERNAL_FOCUS.swap(false, std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    if let Some(id) = app.state::<Notifier>().clicked_banner() {
        open_notice(app, id);
    }
}

// ── Commands for the app webviews (granted to remote NGA origins only) ──────

#[tauri::command]
pub fn web_notify<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    id: String,
    title: String,
    body: Option<String>,
    tag: Option<String>,
    silent: Option<bool>,
) -> Result<(), String> {
    let key = source_app(&app, &webview).ok_or("not an NGA app")?;
    if !valid_web_id(&id) {
        return Err("bad id".into());
    }
    let title = clip(&title, 120);
    if title.is_empty() {
        return Err("empty title".into());
    }
    let body = clip(body.as_deref().unwrap_or(""), 400);
    let tag = clip(tag.as_deref().unwrap_or(""), 120);

    let window_focused = app
        .get_window(WINDOW)
        .and_then(|w| w.is_focused().ok())
        .unwrap_or(false);
    let visible = app
        .get_window(WINDOW)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    let active = app.state::<Shell>().active().as_deref() == Some(key.as_str());
    let routed = route(
        window_focused && visible,
        active,
        settings_quiet(&app, &key),
    );

    let notice = {
        let notifier = app.state::<Notifier>();
        let mut inner = notifier.inner.lock().unwrap();
        let now = Instant::now();
        if over_limit(inner.recent.entry(key.clone()).or_default(), now) {
            return Err("too many notifications".into());
        }
        // Same tag from the same app replaces the earlier notice (web semantics).
        if !tag.is_empty() {
            inner.items.retain(|n| !(n.app == key && n.tag == tag));
        }
        inner.next_id += 1;
        let notice = Notice {
            id: inner.next_id,
            app: key.clone(),
            title,
            body,
            tag,
            web_id: id,
            at: now_ms(),
            read: routed == Route::Seen,
        };
        inner.items.push_back(notice.clone());
        while inner.items.len() > KEEP {
            inner.items.pop_front();
        }
        if routed == Route::Banner {
            inner.last_banner = Some((notice.id, now));
        }
        notice
    };

    match routed {
        Route::Banner => {
            let name = crate::registry::find(&app.state::<Shell>().apps, &key)
                .map(|d| d.name)
                .unwrap_or("NGA");
            crate::os_notify::show(
                &app,
                crate::os_notify::Banner {
                    id: notice.id,
                    app_key: &key,
                    app_name: name,
                    title: &notice.title,
                    body: &notice.body,
                    sound: !silent.unwrap_or(false),
                },
            );
        }
        Route::Toast => {
            let _ = app.emit_to(SHELL, "nga://notice", notice.clone());
        }
        Route::Seen | Route::Quiet => {}
    }
    publish(&app);
    Ok(())
}

#[tauri::command]
pub fn web_badge<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    count: i64,
) -> Result<(), String> {
    let key = source_app(&app, &webview).ok_or("not an NGA app")?;
    {
        let notifier = app.state::<Notifier>();
        let mut inner = notifier.inner.lock().unwrap();
        if count == 0 {
            inner.badges.remove(&key);
        } else {
            inner.badges.insert(key, count.clamp(-1, 9999));
        }
    }
    publish(&app);
    Ok(())
}

/// `window.print()` for WKWebView, which ignores it.
#[tauri::command]
pub fn web_print<R: Runtime>(app: AppHandle<R>, webview: Webview<R>) -> Result<(), String> {
    source_app(&app, &webview).ok_or("not an NGA app")?;
    webview.print().map_err(|e| e.to_string())
}

// ── Commands for the shell ──────────────────────────────────────────────────

#[tauri::command]
pub fn notices_list<R: Runtime>(app: AppHandle<R>) -> Vec<Notice> {
    app.state::<Notifier>().list()
}

#[tauri::command]
pub fn notices_summary<R: Runtime>(app: AppHandle<R>) -> Summary {
    app.state::<Notifier>().summary()
}

#[tauri::command]
pub fn notices_open<R: Runtime>(app: AppHandle<R>, id: u64) {
    open_notice(&app, id);
}

#[tauri::command]
pub fn notices_read_all<R: Runtime>(app: AppHandle<R>) {
    app.state::<Notifier>().mark_all_read();
    publish(&app);
}

#[tauri::command]
pub fn notices_clear<R: Runtime>(app: AppHandle<R>) {
    app.state::<Notifier>().clear();
    publish(&app);
}

#[tauri::command]
pub async fn os_permission() -> crate::os_notify::Permission {
    tauri::async_runtime::spawn_blocking(crate::os_notify::permission)
        .await
        .unwrap_or(crate::os_notify::Permission::Unknown)
}

#[tauri::command]
pub async fn os_permission_request() -> crate::os_notify::Permission {
    tauri::async_runtime::spawn_blocking(crate::os_notify::request)
        .await
        .unwrap_or(crate::os_notify::Permission::Unknown)
}

#[tauri::command]
pub fn os_open_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    crate::os_notify::open_settings(&app)
}

/// A real OS banner, so the person sees what NGA notifications look like (and that they work).
#[tauri::command]
pub fn os_test_banner<R: Runtime>(app: AppHandle<R>) {
    crate::os_notify::show(
        &app,
        crate::os_notify::Banner {
            id: 0,
            app_key: "nga",
            app_name: "NGA",
            title: "Notifications are on",
            body: "You'll see messages, reminders and alerts from every NGA app here.",
            sound: true,
        },
    );
}

#[tauri::command]
pub fn focus_session<R: Runtime>(app: AppHandle<R>) -> Option<String> {
    app.state::<Notifier>().focus_session()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routing_follows_where_the_person_looks() {
        assert_eq!(route(true, true, false), Route::Seen);
        assert_eq!(route(true, true, true), Route::Seen);
        assert_eq!(route(true, false, false), Route::Toast);
        assert_eq!(route(false, true, false), Route::Banner);
        assert_eq!(route(false, false, true), Route::Quiet);
    }

    #[test]
    fn rate_limit_is_per_minute() {
        let mut q = VecDeque::new();
        let t0 = Instant::now();
        for _ in 0..PER_MINUTE {
            assert!(!over_limit(&mut q, t0));
        }
        assert!(over_limit(&mut q, t0));
        assert!(!over_limit(&mut q, t0 + Duration::from_secs(61)));
    }

    #[test]
    fn web_ids_are_safe_to_eval() {
        assert!(valid_web_id("a1B2c3"));
        assert!(!valid_web_id(""));
        assert!(!valid_web_id("x');alert(1);//"));
        assert!(!valid_web_id(&"a".repeat(33)));
    }

    #[test]
    fn summary_counts_unread_and_badges_once_per_app() {
        let n = Notifier::default();
        {
            let mut inner = n.inner.lock().unwrap();
            for (i, app) in ["tupo", "tupo", "tendo"].iter().enumerate() {
                inner.items.push_back(Notice {
                    id: i as u64,
                    app: app.to_string(),
                    title: "t".into(),
                    body: String::new(),
                    tag: String::new(),
                    web_id: "a".into(),
                    at: 0,
                    read: false,
                });
            }
            inner.badges.insert("tupo".into(), 5);
        }
        let s = n.summary();
        assert_eq!(s.unread["tupo"], 2);
        assert_eq!(s.total, 5 + 1); // Tupo's own badge (5) wins over its 2 notices; Tendo 1.
        assert!(n.mark_app_read("tendo"));
        assert_eq!(n.summary().total, 5);
    }
}
