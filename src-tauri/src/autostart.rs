//! Start NGA when the computer starts (Settings → General), hidden in the tray /
//! menu bar, so notices and timer alerts arrive without anyone opening NGA
//! after a reboot.
//!
//! Default: on for staff (teachers, admins, staff) the first time they sign in,
//! off for students and parents (shared lab PCs). Once the person changes the
//! switch, their choice stands.

use tauri::{AppHandle, Runtime};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_store::StoreExt;

/// The launch argument the login item passes: start without showing the window.
pub const HIDDEN_ARG: &str = "--hidden";
/// Set once the default was applied or the person chose.
const CHOSEN_KEY: &str = "autostartChosen";

pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_autostart::Builder::new()
        .args([HIDDEN_ARG])
        .app_name("NGA")
        .build()
}

/// This launch came from the login item.
pub fn started_hidden() -> bool {
    std::env::args().any(|a| a == HIDDEN_ARG)
}

/// The default for a persona (unit-tested).
pub fn default_for(persona: &str) -> bool {
    matches!(persona, "teacher" | "admin" | "staff")
}

/// First sign-in on this computer: apply the persona's default, once.
pub fn apply_default<R: Runtime>(app: &AppHandle<R>, persona: &str) {
    let Ok(store) = app.store("settings.json") else {
        return;
    };
    if store.get(CHOSEN_KEY).and_then(|v| v.as_bool()) == Some(true) {
        return;
    }
    let on = default_for(persona);
    if let Err(e) = set(app, on) {
        log::warn!("autostart default: {e}");
        return;
    }
    log::info!("autostart default for {persona}: {on}");
}

fn set<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<(), String> {
    let launcher = app.autolaunch();
    let result = if on {
        launcher.enable()
    } else if launcher.is_enabled().unwrap_or(false) {
        launcher.disable()
    } else {
        Ok(())
    };
    result.map_err(|e| e.to_string())?;
    if let Ok(store) = app.store("settings.json") {
        store.set(CHOSEN_KEY, serde_json::Value::Bool(true));
        let _ = store.save();
    }
    Ok(())
}

#[tauri::command]
pub fn autostart_get<R: Runtime>(app: AppHandle<R>) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
pub fn autostart_set<R: Runtime>(app: AppHandle<R>, on: bool) -> Result<(), String> {
    set(&app, on)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn staff_start_with_the_computer_students_do_not() {
        for p in ["teacher", "admin", "staff"] {
            assert!(default_for(p), "{p}");
        }
        for p in ["student", "parent", ""] {
            assert!(!default_for(p), "{p}");
        }
    }
}
