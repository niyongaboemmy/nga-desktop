//! The optional system-wide "quick tools" key (off by default; Settings → Tools).
//! Pressing it brings NGA forward with the Tools panel open, from any app.

use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

pub const KEY: &str = "CommandOrControl+Shift+Space";

pub fn enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get("toolsShortcut"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// The plugin, with the handler: show NGA and open the Tools panel.
pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                crate::menus::focus_main(app);
                let _ = tauri::Emitter::emit_to(app, crate::webviews::SHELL, "nga://menu", "tools");
            }
        })
        .build()
}

/// Register or unregister to match the setting. Returns whether it's on.
pub fn apply<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<bool, String> {
    let gs = app.global_shortcut();
    let key: Shortcut = KEY.parse().map_err(|e| format!("{e}"))?;
    let registered = gs.is_registered(key);
    if on && !registered {
        // Another app may own it already: say so instead of failing silently.
        gs.register(key)
            .map_err(|_| "Another app already uses this shortcut".to_string())?;
    } else if !on && registered {
        gs.unregister(key).map_err(|e| e.to_string())?;
    }
    Ok(on)
}

pub fn init<R: Runtime>(app: &AppHandle<R>) {
    if enabled(app) {
        if let Err(e) = apply(app, true) {
            log::warn!("tools: quick shortcut not registered: {e}");
        }
    }
}

#[tauri::command]
pub fn tools_shortcut_set<R: Runtime>(app: AppHandle<R>, on: bool) -> Result<bool, String> {
    let result = apply(&app, on);
    if let Ok(store) = app.store("settings.json") {
        store.set("toolsShortcut", on && result.is_ok());
    }
    result
}
