//! In-app updates.
//!
//! The NGA update service (NGA MIS backend, `GET /desktop/update/{target}/{arch}/{version}`)
//! answers 204 when this version is current, or with the newer version's signed
//! package. NGA checks shortly after start, every hour and when the person comes
//! back after a while, and tells the shell (title-bar "Update" pill, one toast
//! per version).
//!
//! **Automatic updates** (Settings → Updates, on by default): a new version is
//! downloaded in the background, then installed when nobody is using the
//! computer (no keyboard or mouse for 10 minutes, see idle.rs) and nothing would
//! be cut short (quiz, meeting, running timer, Present window), or when NGA is
//! quit. Before 0.16 updates waited for a click, and lab PCs stayed on 0.8.0.
//!
//! Each check sends a random install id (`X-NGA-Install`), so the school can
//! count active installs and which versions they run, and how the last update
//! went (`X-NGA-Update-Report`), so a PC that can't install shows up on /apps.
//! Nothing personal. CI smoke tests say so (`X-NGA-CI`) and aren't counted.

use serde::Serialize;
use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime, Url};
use tauri_plugin_store::StoreExt;
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::registry::{self, Env};

const FIRST_CHECK: Duration = Duration::from_secs(45);
/// Hourly, and when the person comes back to NGA after a while (on_focus):
/// every 6 h meant a new version could stay unnoticed for most of a day.
const EVERY: Duration = Duration::from_secs(60 * 60);
const ON_FOCUS_AFTER: Duration = Duration::from_secs(30 * 60);
/// How often the background loop looks at the clock and the idle time.
const TICK: Duration = Duration::from_secs(60);
/// No keyboard or mouse anywhere on the computer for this long = unattended.
pub const IDLE_FOR: Duration = Duration::from_secs(10 * 60);

const SETTINGS: &str = "settings.json";
/// Settings → Updates → "Install updates automatically" (default on).
const AUTO_KEY: &str = "autoUpdate";
/// The version an install was started for (checked after the restart).
const INSTALLING_KEY: &str = "updateInstalling";
/// The outcome waiting to be sent with the next check.
const REPORT_KEY: &str = "updateReport";

static LAST_CHECK: Mutex<Option<Instant>> = Mutex::new(None);

/// The window got focus: check if the last check was a while ago.
pub fn on_focus<R: Runtime>(app: &AppHandle<R>) {
    if crate::updater_pubkey().is_none() {
        return;
    }
    let due = LAST_CHECK
        .lock()
        .unwrap()
        .is_none_or(|t| t.elapsed() >= ON_FOCUS_AFTER);
    if !due {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match check(&app).await {
            Ok(Some(info)) => announce(&app, &info),
            Ok(None) => {}
            Err(e) => log::warn!("update check failed: {e}"),
        }
    });
}

/// The update found by the last check, and its package once downloaded in the
/// background (kept until it is installed).
#[derive(Default)]
pub struct Pending {
    update: Mutex<Option<Update>>,
    staged: Mutex<Option<Staged>>,
    /// A background download or an install is under way.
    busy: Mutex<bool>,
}

struct Staged {
    version: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current: String,
    pub notes: Option<String>,
    pub date: Option<String>,
}

fn endpoint() -> Url {
    let base = match registry::current_env() {
        Env::Production => "https://api.amashuri.com",
        Env::Development => "http://localhost:5001",
    };
    Url::parse(&format!(
        "{base}/desktop/update/{{{{target}}}}/{{{{arch}}}}/{{{{current_version}}}}"
    ))
    .expect("valid update endpoint")
}

/// A random id for this installation, made once and kept in settings.json.
fn install_id<R: Runtime>(app: &AppHandle<R>) -> String {
    let Ok(store) = app.store(SETTINGS) else {
        return "unknown".into();
    };
    if let Some(id) = store
        .get("installId")
        .and_then(|v| v.as_str().map(String::from))
    {
        return id;
    }
    let id = format!("{:016x}{:016x}", random_u64(), random_u64());
    store.set("installId", serde_json::Value::String(id.clone()));
    let _ = store.save();
    id
}

fn random_u64() -> u64 {
    let mut h = RandomState::new().build_hasher();
    h.write_u128(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default(),
    );
    h.finish()
}

fn setting_str<R: Runtime>(app: &AppHandle<R>, key: &str) -> Option<String> {
    app.store(SETTINGS)
        .ok()?
        .get(key)
        .and_then(|v| v.as_str().map(String::from))
}

fn set_setting<R: Runtime>(app: &AppHandle<R>, key: &str, value: Option<String>) {
    if let Ok(store) = app.store(SETTINGS) {
        match value {
            Some(v) => store.set(key, serde_json::Value::String(v)),
            None => {
                store.delete(key);
            }
        }
        let _ = store.save();
    }
}

/// Settings → Updates → "Install updates automatically".
pub fn auto_enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.store(SETTINGS)
        .ok()
        .and_then(|s| s.get(AUTO_KEY))
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

/// The outcome to send for an install started before this launch: `installed`
/// when this is (at least) that version, otherwise `failed` (the installer ran
/// but the old version came back, which is what stuck lab PCs looked like).
pub fn report_after_restart(installing: Option<&str>, current: &str) -> Option<String> {
    let to = installing?.trim();
    if to.is_empty() {
        return None;
    }
    Some(if version_at_least(current, to) {
        format!("installed {to}")
    } else {
        format!("failed {to} still on {current} after the installer ran")
    })
}

fn version_at_least(current: &str, target: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.trim_start_matches('v')
            .split(['-', '+'])
            .next()
            .unwrap_or("")
            .split('.')
            .map(|p| p.parse().unwrap_or(0))
            .collect()
    };
    parse(current) >= parse(target)
}

/// Header-safe: one line, ASCII, short.
fn header_value(report: &str) -> String {
    report
        .chars()
        .map(|c| if c.is_ascii_graphic() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(240)
        .collect()
}

/// Running inside a CI job (the installer smoke test): don't count as an install.
fn in_ci() -> bool {
    std::env::var_os("GITHUB_ACTIONS").is_some() || std::env::var_os("NGA_CI").is_some()
}

/// Asks the update service. `Ok(None)`: up to date, or a build without the updater.
pub async fn check<R: Runtime>(app: &AppHandle<R>) -> Result<Option<UpdateInfo>, String> {
    if crate::updater_pubkey().is_none() {
        return Ok(None);
    }
    *LAST_CHECK.lock().unwrap() = Some(Instant::now());
    let report = setting_str(app, REPORT_KEY);
    let mut builder = app
        .updater_builder()
        .endpoints(vec![endpoint()])
        .map_err(|e| e.to_string())?
        .header("X-NGA-Install", install_id(app))
        .map_err(|e| e.to_string())?
        .timeout(Duration::from_secs(20));
    if let Some(r) = &report {
        builder = builder
            .header("X-NGA-Update-Report", header_value(r))
            .map_err(|e| e.to_string())?;
    }
    if in_ci() {
        builder = builder.header("X-NGA-CI", "1").map_err(|e| e.to_string())?;
    }
    let updater = builder.build().map_err(|e| e.to_string())?;
    let found = updater.check().await.map_err(|e| e.to_string())?;
    // The service answered, so it has the report (unless a newer one was made meanwhile).
    if report.is_some() && setting_str(app, REPORT_KEY) == report {
        set_setting(app, REPORT_KEY, None);
    }
    let Some(update) = found else {
        return Ok(None);
    };
    let info = UpdateInfo {
        version: update.version.clone(),
        current: update.current_version.clone(),
        notes: update.body.clone(),
        date: update.date.map(|d| d.to_string()),
    };
    let pending = app.state::<Pending>();
    // A package staged for an older offer is useless now.
    let mut staged = pending.staged.lock().unwrap();
    if staged.as_ref().is_some_and(|s| s.version != update.version) {
        *staged = None;
    }
    drop(staged);
    *pending.update.lock().unwrap() = Some(update);
    Ok(Some(info))
}

/// Starts the background checks (release builds with an updater key only).
pub fn spawn<R: Runtime>(app: AppHandle<R>) {
    if crate::updater_pubkey().is_none() {
        return;
    }
    // An install started before this launch: did it work?
    let installing = setting_str(&app, INSTALLING_KEY);
    if let Some(report) =
        report_after_restart(installing.as_deref(), app.package_info().version.to_string().as_str())
    {
        log::info!("update report: {report}");
        set_setting(&app, REPORT_KEY, Some(report));
        set_setting(&app, INSTALLING_KEY, None);
    }
    tauri::async_runtime::spawn(async move {
        tokio_sleep(FIRST_CHECK).await;
        let mut last: Option<Instant> = None;
        loop {
            if last.is_none_or(|t| t.elapsed() >= EVERY) {
                last = Some(Instant::now());
                match check(&app).await {
                    Ok(Some(info)) => announce(&app, &info),
                    Ok(None) => {}
                    Err(e) => log::warn!("update check failed: {e}"),
                }
            }
            if auto_enabled(&app) {
                stage(&app).await;
                if let Some(why) = blocker(&app) {
                    log::debug!("auto-update waits: {why}");
                } else if staged_version(&app).is_some() {
                    log::info!("auto-update: the computer is idle; installing");
                    if let Err(e) = install_staged(&app, true) {
                        log::warn!("auto-update failed: {e}");
                    }
                }
            }
            tokio_sleep(TICK).await;
        }
    });
}

async fn tokio_sleep(d: Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(d)).await;
}

fn staged_version<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    app.state::<Pending>()
        .staged
        .lock()
        .unwrap()
        .as_ref()
        .map(|s| s.version.clone())
}

/// Downloads the offered update in the background (signature checked by the
/// plugin), so installing later takes seconds.
async fn stage<R: Runtime>(app: &AppHandle<R>) {
    let pending = app.state::<Pending>();
    let Some(update) = pending.update.lock().unwrap().clone() else {
        return;
    };
    if staged_version(app).as_deref() == Some(update.version.as_str()) {
        return;
    }
    {
        let mut busy = pending.busy.lock().unwrap();
        if *busy {
            return;
        }
        *busy = true;
    }
    let result = update.download(|_, _| {}, || {}).await;
    *pending.busy.lock().unwrap() = false;
    match result {
        Ok(bytes) => {
            log::info!("update {} downloaded ({} bytes)", update.version, bytes.len());
            set_setting(app, REPORT_KEY, Some(format!("downloaded {}", update.version)));
            *pending.staged.lock().unwrap() = Some(Staged {
                version: update.version.clone(),
                bytes,
            });
        }
        Err(e) => {
            log::warn!("update download failed: {e}");
            set_setting(
                app,
                REPORT_KEY,
                Some(format!("failed {} download: {e}", update.version)),
            );
        }
    }
}

/// Why an automatic install must wait now, or None when it may go ahead.
fn blocker<R: Runtime>(app: &AppHandle<R>) -> Option<&'static str> {
    if *app.state::<Pending>().busy.lock().unwrap() {
        return Some("busy");
    }
    if app
        .state::<crate::notifications::Notifier>()
        .focus_session()
        .is_some()
    {
        return Some("quiz or meeting open");
    }
    if crate::tools::timers::any_running(app) {
        return Some("a timer is running");
    }
    if app.webview_windows().keys().any(|l| {
        l.starts_with(crate::tools::windows::PRESENT_PREFIX)
            || l.starts_with(crate::tools::windows::TOOL_PREFIX)
    }) {
        return Some("a tool window is open");
    }
    may_install_when_idle(crate::idle::system_idle())
}

/// The idle rule alone (unit-tested): unknown idle time never counts as idle.
fn may_install_when_idle(idle: Option<Duration>) -> Option<&'static str> {
    match idle {
        Some(d) if d >= IDLE_FOR => None,
        Some(_) => Some("someone is using the computer"),
        None => Some("idle time unknown"),
    }
}

/// Installs the background-downloaded package. Windows: the installer takes
/// over and NGA exits (and is restarted by it when `restart`); macOS: NGA
/// restarts itself when `restart`.
fn install_staged<R: Runtime>(app: &AppHandle<R>, restart: bool) -> Result<(), String> {
    let pending = app.state::<Pending>();
    let Some(update) = pending.update.lock().unwrap().clone() else {
        return Err("no update".into());
    };
    let Some(staged) = pending.staged.lock().unwrap().take() else {
        return Err("not downloaded yet".into());
    };
    if staged.version != update.version {
        return Err("stale download".into());
    }
    let version = update.version.clone();
    set_setting(app, INSTALLING_KEY, Some(version.clone()));
    let result = update
        .restart_after_install(restart)
        .install(&staged.bytes)
        .map_err(|e| e.to_string());
    if let Err(e) = &result {
        set_setting(app, INSTALLING_KEY, None);
        set_setting(
            app,
            REPORT_KEY,
            Some(format!("failed {version} install: {e}")),
        );
        return result;
    }
    log::info!("update {version} installed");
    if restart {
        app.restart();
    }
    Ok(())
}

/// Quit from the tray or app menu: put a downloaded update in place first (no
/// restart), so the next start is the new version.
pub fn quit<R: Runtime>(app: &AppHandle<R>) {
    if auto_enabled(app) && staged_version(app).is_some() {
        if let Err(e) = install_staged(app, false) {
            log::warn!("install on quit failed: {e}");
        }
    }
    app.exit(0);
}

/// The shell shows the "Update" pill; the toast only once per version.
fn announce<R: Runtime>(app: &AppHandle<R>, info: &UpdateInfo) {
    log::info!("update available: {} -> {}", info.current, info.version);
    let first_time = app
        .store(SETTINGS)
        .ok()
        .map(|s| {
            let seen = s
                .get("updateAnnounced")
                .and_then(|v| v.as_str().map(String::from));
            if seen.as_deref() == Some(info.version.as_str()) {
                false
            } else {
                s.set(
                    "updateAnnounced",
                    serde_json::Value::String(info.version.clone()),
                );
                let _ = s.save();
                true
            }
        })
        .unwrap_or(true);
    let _ = app.emit_to(
        crate::webviews::SHELL,
        "nga://update",
        serde_json::json!({ "info": info, "announce": first_time, "auto": auto_enabled(app) }),
    );
}

#[tauri::command]
pub async fn update_check<R: Runtime>(app: AppHandle<R>) -> Result<Option<UpdateInfo>, String> {
    let found = check(&app).await?;
    if let Some(info) = &found {
        announce(&app, info);
    }
    Ok(found)
}

/// Settings → Updates → "Install updates automatically".
#[tauri::command]
pub fn update_auto_get<R: Runtime>(app: AppHandle<R>) -> bool {
    auto_enabled(&app)
}

#[tauri::command]
pub fn update_auto_set<R: Runtime>(app: AppHandle<R>, on: bool) {
    if let Ok(store) = app.store(SETTINGS) {
        store.set(AUTO_KEY, serde_json::Value::Bool(on));
        let _ = store.save();
    }
}

/// Downloads (reporting `nga://update-progress` 0-100), installs and restarts.
#[tauri::command]
pub async fn update_install<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    install(app).await
}

/// The one click-to-install path (title-bar Update button, Settings, MIS pages).
/// Not while a quiz or meeting is open: restarting would end it.
async fn install<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(busy) = app
        .state::<crate::notifications::Notifier>()
        .focus_session()
    {
        return Err(format!("busy: finish the {busy} quiz or meeting first"));
    }
    if app.state::<Pending>().update.lock().unwrap().is_none() {
        check(&app).await?;
    }
    // Already downloaded in the background: install it straight away.
    if staged_version(&app).is_some() {
        let _ = app.emit_to(crate::webviews::SHELL, "nga://update-progress", 100);
        return install_staged(&app, true);
    }
    let pending = app.state::<Pending>().update.lock().unwrap().clone();
    let Some(update) = pending else {
        return Err("NGA is up to date".into());
    };
    let progress = app.clone();
    let mut done: u64 = 0;
    set_setting(&app, INSTALLING_KEY, Some(update.version.clone()));
    let result = update
        .download_and_install(
            move |chunk, total| {
                done += chunk as u64;
                if let Some(total) = total.filter(|t| *t > 0) {
                    let pct = (done * 100 / total).min(100);
                    let _ = progress.emit_to(crate::webviews::SHELL, "nga://update-progress", pct);
                }
            },
            || {},
        )
        .await;
    if let Err(e) = result {
        set_setting(&app, INSTALLING_KEY, None);
        set_setting(
            &app,
            REPORT_KEY,
            Some(format!("failed {} install: {e}", update.version)),
        );
        return Err(e.to_string());
    }
    log::info!("update installed; restarting");
    app.restart();
}

/// Only NGA MIS's pages (its /apps page) may ask; any other page gets an error.
fn from_mis<R: Runtime>(webview: &tauri::Webview<R>) -> Result<(), String> {
    if webview.label() == crate::webviews::label("mis") {
        Ok(())
    } else {
        Err("not allowed".into())
    }
}

/// For MIS pages (bridge.js `ngaDesktop.checkUpdate()`): a newer version, or null.
#[tauri::command]
pub async fn web_update_check<R: Runtime>(
    app: AppHandle<R>,
    webview: tauri::Webview<R>,
) -> Result<Option<UpdateInfo>, String> {
    from_mis(&webview)?;
    let found = check(&app).await?;
    if let Some(info) = &found {
        announce(&app, info);
    }
    Ok(found)
}

/// For MIS pages (bridge.js `ngaDesktop.installUpdate()`): one click to
/// update. It can only install NGA's own signed update, then restarts NGA.
#[tauri::command]
pub async fn web_update_install<R: Runtime>(
    app: AppHandle<R>,
    webview: tauri::Webview<R>,
) -> Result<(), String> {
    from_mis(&webview)?;
    install(app).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn after_restart_a_new_version_reports_installed() {
        assert_eq!(
            report_after_restart(Some("0.16.0"), "0.16.0").as_deref(),
            Some("installed 0.16.0")
        );
        // A later version also counts (a second update went in meanwhile).
        assert_eq!(
            report_after_restart(Some("0.16.0"), "0.17.1").as_deref(),
            Some("installed 0.16.0")
        );
    }

    #[test]
    fn the_old_version_coming_back_is_a_failure() {
        assert_eq!(
            report_after_restart(Some("0.16.0"), "0.8.0").as_deref(),
            Some("failed 0.16.0 still on 0.8.0 after the installer ran")
        );
        // Numeric, not string, comparison.
        assert!(report_after_restart(Some("0.10.0"), "0.9.0")
            .unwrap()
            .starts_with("failed"));
    }

    #[test]
    fn nothing_to_report_without_an_install() {
        assert_eq!(report_after_restart(None, "0.16.0"), None);
        assert_eq!(report_after_restart(Some(" "), "0.16.0"), None);
    }

    #[test]
    fn auto_install_waits_for_an_unattended_computer() {
        assert_eq!(may_install_when_idle(Some(IDLE_FOR)), None);
        assert_eq!(may_install_when_idle(Some(Duration::from_secs(3600))), None);
        assert!(may_install_when_idle(Some(Duration::from_secs(30))).is_some());
        assert!(may_install_when_idle(None).is_some());
    }

    #[test]
    fn report_headers_are_one_safe_line() {
        assert_eq!(
            header_value("failed 0.16.0 install:\n  Access is denied.\r\n é"),
            "failed 0.16.0 install: Access is denied."
        );
        assert!(header_value(&"x".repeat(1000)).len() <= 240);
    }
}
