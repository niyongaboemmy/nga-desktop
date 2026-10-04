//! In-app updates.
//!
//! The NGA update service (NGA MIS backend, `GET /desktop/update/{target}/{arch}/{version}`)
//! answers 204 when this version is current, or with the newer version's signed
//! package. NGA checks shortly after start and every few hours, tells the
//! shell (title-bar "Update" pill, one toast per version), and installs only
//! when the person clicks: never by itself in the middle of a quiz or meeting.
//!
//! Each check sends a random install id (`X-NGA-Install`), so the school can
//! count active installs and which versions they run. Nothing personal.

use serde::Serialize;
use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime, Url};
use tauri_plugin_store::StoreExt;
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::registry::{self, Env};

const FIRST_CHECK: Duration = Duration::from_secs(45);
const EVERY: Duration = Duration::from_secs(6 * 60 * 60);

/// The update found by the last check, kept until it is installed.
#[derive(Default)]
pub struct Pending(Mutex<Option<Update>>);

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
    let Ok(store) = app.store("settings.json") else {
        return "unknown".into();
    };
    if let Some(id) = store.get("installId").and_then(|v| v.as_str().map(String::from)) {
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

/// Asks the update service. `Ok(None)`: up to date, or a build without the updater.
pub async fn check<R: Runtime>(app: &AppHandle<R>) -> Result<Option<UpdateInfo>, String> {
    if crate::updater_pubkey().is_none() {
        return Ok(None);
    }
    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint()])
        .map_err(|e| e.to_string())?
        .header("X-NGA-Install", install_id(app))
        .map_err(|e| e.to_string())?
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let info = UpdateInfo {
        version: update.version.clone(),
        current: update.current_version.clone(),
        notes: update.body.clone(),
        date: update.date.map(|d| d.to_string()),
    };
    *app.state::<Pending>().0.lock().unwrap() = Some(update);
    Ok(Some(info))
}

/// Starts the background checks (release builds with an updater key only).
pub fn spawn<R: Runtime>(app: AppHandle<R>) {
    if crate::updater_pubkey().is_none() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        tokio_sleep(FIRST_CHECK).await;
        loop {
            match check(&app).await {
                Ok(Some(info)) => announce(&app, &info),
                Ok(None) => {}
                Err(e) => log::warn!("update check failed: {e}"),
            }
            tokio_sleep(EVERY).await;
        }
    });
}

async fn tokio_sleep(d: Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(d)).await;
}

/// The shell shows the "Update" pill; the toast only once per version.
fn announce<R: Runtime>(app: &AppHandle<R>, info: &UpdateInfo) {
    log::info!("update available: {} -> {}", info.current, info.version);
    let first_time = app
        .store("settings.json")
        .ok()
        .map(|s| {
            let seen = s.get("updateAnnounced").and_then(|v| v.as_str().map(String::from));
            if seen.as_deref() == Some(info.version.as_str()) {
                false
            } else {
                s.set("updateAnnounced", serde_json::Value::String(info.version.clone()));
                let _ = s.save();
                true
            }
        })
        .unwrap_or(true);
    let _ = app.emit_to(
        crate::webviews::SHELL,
        "nga://update",
        serde_json::json!({ "info": info, "announce": first_time }),
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

/// Downloads (reporting `nga://update-progress` 0-100), installs and restarts.
#[tauri::command]
pub async fn update_install<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let pending = app.state::<Pending>().0.lock().unwrap().take();
    let Some(update) = pending else {
        return Err("no update to install".into());
    };
    let progress = app.clone();
    let mut done: u64 = 0;
    update
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
        .await
        .map_err(|e| e.to_string())?;
    log::info!("update installed; restarting");
    app.restart();
}
