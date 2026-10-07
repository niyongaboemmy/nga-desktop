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
//! The inbox is kept in `inbox.json` (last 7 days) so notices survive a restart,
//! and sign-out clears it. A notice can be snoozed: it comes back as a banner later.

use crate::webviews::{self, Shell, SHELL, WINDOW};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, Runtime, Webview};
use tauri_plugin_store::StoreExt;

const KEEP: usize = 200;
const INBOX_STORE: &str = "inbox.json";
/// Notices older than this aren't brought back after a restart.
const RESTORE_DAYS: u64 = 7;
pub const SNOOZE_MINUTES: [u64; 3] = [10, 60, 180];
const PER_MINUTE: usize = 12;
/// Where the OS doesn't report banner clicks (Windows): coming back to NGA
/// this soon after a banner counts as clicking it. Short, because a wrong
/// guess switches apps under the person.
const CLICK_WINDOW: Duration = Duration::from_secs(6);

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

/// What `inbox.json` keeps of a notice (the page's onclick id can't survive a restart).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct Stored {
    id: u64,
    app: String,
    title: String,
    body: String,
    #[serde(default)]
    tag: String,
    at: u64,
    read: bool,
}

impl From<&Notice> for Stored {
    fn from(n: &Notice) -> Self {
        Stored {
            id: n.id,
            app: n.app.clone(),
            title: n.title.clone(),
            body: n.body.clone(),
            tag: n.tag.clone(),
            at: n.at,
            read: n.read,
        }
    }
}

/// The stored notices worth bringing back: recent, newest last, at most KEEP.
fn restorable(mut stored: Vec<Stored>, now: u64) -> Vec<Notice> {
    let cutoff = now.saturating_sub(RESTORE_DAYS * 24 * 60 * 60 * 1000);
    stored.retain(|s| s.at >= cutoff && !s.app.is_empty() && !s.title.is_empty());
    stored.sort_by_key(|s| s.id);
    let skip = stored.len().saturating_sub(KEEP);
    stored
        .into_iter()
        .skip(skip)
        .map(|s| Notice {
            id: s.id,
            app: s.app,
            title: clip(&s.title, 120),
            body: clip(&s.body, 400),
            tag: s.tag,
            web_id: String::new(),
            at: s.at,
            read: s.read,
        })
        .collect()
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
    /// The notices changed since they were last saved.
    dirty: bool,
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
    let url = crate::webviews::page_url(webview)?;
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
        inner.dirty = true;
    }

    /// Opening an app reads its notices (like opening a chat reads it).
    pub fn mark_app_read(&self, key: &str) -> bool {
        let mut inner = self.inner.lock().unwrap();
        let mut changed = false;
        for n in inner.items.iter_mut().filter(|n| n.app == key && !n.read) {
            n.read = true;
            changed = true;
        }
        inner.dirty |= changed;
        changed
    }

    pub fn mark_all_read(&self) {
        let mut inner = self.inner.lock().unwrap();
        for n in inner.items.iter_mut() {
            n.read = true;
        }
        inner.dirty = true;
    }

    fn take(&self, id: u64) -> Option<Notice> {
        let mut inner = self.inner.lock().unwrap();
        let n = inner.items.iter_mut().find(|n| n.id == id)?;
        n.read = true;
        let n = n.clone();
        inner.dirty = true;
        Some(n)
    }

    /// Brings back the notices saved before the last quit (after sign-in data is known to be kept).
    fn restore(&self, stored: Vec<Stored>) {
        let items = restorable(stored, now_ms());
        let mut inner = self.inner.lock().unwrap();
        inner.next_id = inner.next_id.max(items.iter().map(|n| n.id).max().unwrap_or(0));
        inner.items = items.into();
    }

    /// The notices to save, if they changed since the last save.
    fn to_save(&self) -> Option<Vec<Stored>> {
        let mut inner = self.inner.lock().unwrap();
        if !inner.dirty {
            return None;
        }
        inner.dirty = false;
        Some(inner.items.iter().map(Stored::from).collect())
    }

    /// Snooze: read now; `bring_back` re-adds it as a new unread notice.
    fn snooze(&self, id: u64) -> Option<Notice> {
        self.take(id)
    }

    fn bring_back(&self, n: &Notice) -> Notice {
        let mut inner = self.inner.lock().unwrap();
        inner.items.retain(|x| x.id != n.id);
        inner.next_id += 1;
        let again = Notice {
            id: inner.next_id,
            read: false,
            at: now_ms(),
            web_id: String::new(),
            ..n.clone()
        };
        inner.items.push_back(again.clone());
        while inner.items.len() > KEEP {
            inner.items.pop_front();
        }
        inner.dirty = true;
        again
    }

    /// The banner shown last, if NGA was re-focused soon enough to count as a click on it.
    fn clicked_banner(&self) -> Option<u64> {
        let mut inner = self.inner.lock().unwrap();
        let (id, at) = inner.last_banner.take()?;
        (at.elapsed() <= CLICK_WINDOW).then_some(id)
    }
}

/// Startup: the inbox as it was when NGA last quit.
pub fn restore<R: Runtime>(app: &AppHandle<R>) {
    let stored: Vec<Stored> = app
        .store(INBOX_STORE)
        .ok()
        .and_then(|s| s.get("items"))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    if !stored.is_empty() {
        app.state::<Notifier>().restore(stored);
        log::info!("inbox restored ({} notices)", app.state::<Notifier>().list().len());
    }
}

fn persist<R: Runtime>(app: &AppHandle<R>) {
    let Some(items) = app.state::<Notifier>().to_save() else {
        return;
    };
    if let Ok(store) = app.store(INBOX_STORE) {
        store.set("items", serde_json::to_value(items).unwrap_or_default());
        let _ = store.save();
    }
}

pub fn publish<R: Runtime>(app: &AppHandle<R>) {
    persist(app);
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
///
/// Only where banner clicks aren't reported. macOS reports them
/// (os_notify), and there the guess was wrong: clicking back into NGA
/// within seconds of an unrelated banner switched to that banner's app
/// (seen in the CI probe; in a proctored quiz that's a "left the quiz").
pub fn on_focus<R: Runtime>(app: &AppHandle<R>) {
    if INTERNAL_FOCUS.swap(false, std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    if crate::os_notify::reports_clicks() {
        app.state::<Notifier>().inner.lock().unwrap().last_banner = None;
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
        inner.dirty = true;
        if routed == Route::Banner {
            inner.last_banner = Some((notice.id, now));
        }
        notice
    };

    // Diagnostics: which app, where it went. Never the text (it can be personal).
    log::info!("[{key}] notification #{} -> {:?}", notice.id, routed);
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
        log::info!("[{key}] badge {count}");
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

/// "Remind me later": the notice goes quiet now and comes back as a banner
/// (or a toast, when NGA is in front) after `minutes` (10, 60 or 180).
/// Snoozes don't survive quitting NGA.
#[tauri::command]
pub fn notices_snooze<R: Runtime>(app: AppHandle<R>, id: u64, minutes: u64) -> Result<(), String> {
    if !SNOOZE_MINUTES.contains(&minutes) {
        return Err("bad snooze".into());
    }
    let n = app
        .state::<Notifier>()
        .snooze(id)
        .ok_or("no such notice")?;
    publish(&app);
    log::info!("[{}] notice #{id} snoozed {minutes} min", n.app);
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(minutes * 60)).await;
        let again = app.state::<Notifier>().bring_back(&n);
        let focused = app
            .get_window(WINDOW)
            .and_then(|w| w.is_focused().ok())
            .unwrap_or(false);
        if focused {
            let _ = app.emit_to(SHELL, "nga://notice", again.clone());
        } else {
            let name = crate::registry::find(&app.state::<Shell>().apps, &again.app)
                .map(|d| d.name)
                .unwrap_or("NGA");
            crate::os_notify::show(
                &app,
                crate::os_notify::Banner {
                    id: again.id,
                    app_key: &again.app,
                    app_name: name,
                    title: &again.title,
                    body: &again.body,
                    sound: true,
                },
            );
        }
        publish(&app);
    });
    Ok(())
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

    fn stored(id: u64, at: u64) -> Stored {
        Stored {
            id,
            app: "tupo".into(),
            title: format!("n{id}"),
            body: String::new(),
            tag: String::new(),
            at,
            read: false,
        }
    }

    #[test]
    fn restart_brings_back_recent_notices_only() {
        let day = 24 * 60 * 60 * 1000;
        let now = 100 * day;
        let back = restorable(
            vec![stored(3, now - day), stored(1, now - 30 * day), stored(2, now - 2 * day)],
            now,
        );
        assert_eq!(back.iter().map(|n| n.id).collect::<Vec<_>>(), vec![2, 3]);
        assert!(back.iter().all(|n| n.web_id.is_empty()));
        let many: Vec<Stored> = (0..(KEEP as u64 + 50)).map(|i| stored(i, now)).collect();
        let back = restorable(many, now);
        assert_eq!(back.len(), KEEP);
        assert_eq!(back.last().unwrap().id, KEEP as u64 + 49);
    }

    #[test]
    fn saving_happens_only_after_a_change_and_ids_keep_counting() {
        let n = Notifier::default();
        n.restore(vec![stored(41, now_ms())]);
        assert!(n.to_save().is_none());
        n.mark_all_read();
        let saved = n.to_save().unwrap();
        assert!(saved[0].read);
        assert!(n.to_save().is_none());
        // Snoozed notices come back unread, with a new id after the restored ones.
        let first = n.snooze(41).unwrap();
        let again = n.bring_back(&first);
        assert_eq!(again.id, 42);
        assert!(!again.read);
        assert_eq!(n.list().len(), 1);
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
