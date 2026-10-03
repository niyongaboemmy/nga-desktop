//! One light/dark theme for the shell and all four NGA apps, both ways.
//!
//! The source of truth is the person's NGA account (`preferred_theme` in MIS):
//! every app already saves its own theme switch there (Task Mentor and Tupo
//! through the MIS API, MIS itself directly), and Tupo pulls it back.
//!
//! - **Switch in the shell:** push to every app (`nga:set-theme` event, see
//!   bridge.js); MIS also saves it to the account, so nothing reverts.
//! - **Switch inside an app:** the app saves it as always; the bridge reports
//!   it here, the shell UI follows and the other apps get it pushed (not saved
//!   again).
//! - **A page loads:** it gets the current theme pushed once it's ready.
//!
//! Equal values are ignored everywhere, so a pushed theme coming back from an
//! app's own re-render never loops.

use crate::registry;
use crate::webviews::{self, Shell, SHELL, WINDOW};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[derive(Default)]
pub struct SharedTheme(Mutex<Option<String>>);

fn valid(theme: &str) -> bool {
    matches!(theme, "light" | "dark")
}

/// Push `theme` into one app page. `persist`: let that app save it to the account.
fn push_to<R: Runtime>(wv: &tauri::Webview<R>, theme: &str, persist: bool) {
    let _ = wv.eval(format!(
        "window.__ngaSetTheme && window.__ngaSetTheme('{theme}', {persist})"
    ));
}

/// Push to every open app except the one it came from. MIS also saves it to
/// the account when the switch started outside MIS (the shell, or an app such
/// as Tendo that only keeps its theme locally), so a later MIS sign-in or
/// Tupo's pull never reverts it.
fn push_all<R: Runtime>(app: &AppHandle<R>, theme: &str, except: Option<&str>) {
    let shell = app.state::<Shell>();
    let mis = registry::identity_provider(&shell.apps).key;
    for a in &shell.apps {
        if Some(a.key) == except {
            continue;
        }
        if let Some(wv) = app.get_webview(&webviews::label(a.key)) {
            push_to(&wv, theme, a.key == mis);
        }
    }
}

/// Push without saving anywhere (the shell is following, not choosing).
fn push_quietly<R: Runtime>(app: &AppHandle<R>, theme: &str) {
    let shell = app.state::<Shell>();
    for a in &shell.apps {
        if let Some(wv) = app.get_webview(&webviews::label(a.key)) {
            push_to(&wv, theme, false);
        }
    }
}

/// A page finished loading: give it the current theme.
pub fn on_page_loaded<R: Runtime>(app: &AppHandle<R>, wv: &tauri::Webview<R>) {
    if let Some(theme) = app.state::<SharedTheme>().0.lock().unwrap().clone() {
        push_to(wv, &theme, false);
    }
}

/// The shell's theme changed (`user`: the person picked it in the shell; else
/// it is following an app or the computer). Also sets the native window chrome.
#[tauri::command]
pub fn set_window_theme<R: Runtime>(
    app: AppHandle<R>,
    theme: String,
    user: Option<bool>,
) -> Result<(), String> {
    if !valid(&theme) {
        return Err("bad theme".into());
    }
    if let Some(w) = app.get_window(WINDOW) {
        let t = if theme == "dark" {
            tauri::Theme::Dark
        } else {
            tauri::Theme::Light
        };
        let _ = w.set_theme(Some(t));
    }
    let changed = {
        let state = app.state::<SharedTheme>();
        let mut cur = state.0.lock().unwrap();
        let changed = cur.as_deref() != Some(theme.as_str());
        *cur = Some(theme.clone());
        changed
    };
    if changed {
        log::info!(
            "theme -> {theme} (from the shell{})",
            if user.unwrap_or(false) {
                ", saved to the account"
            } else {
                ""
            }
        );
        // Only a person's pick in the shell is saved; following the computer
        // or an app is not a new choice.
        if user.unwrap_or(false) {
            push_all(&app, &theme, None);
        } else {
            push_quietly(&app, &theme);
        }
    }
    Ok(())
}

/// An app's own theme switch (bridge.js watches each page). The app already
/// saved it to the account; make everything else follow.
#[tauri::command]
pub fn web_theme<R: Runtime>(
    app: AppHandle<R>,
    webview: tauri::Webview<R>,
    theme: String,
) -> Result<(), String> {
    let key = webview
        .label()
        .strip_prefix("app-")
        .ok_or("not an NGA app")?
        .to_string();
    if !valid(&theme) {
        return Err("bad theme".into());
    }
    {
        let state = app.state::<SharedTheme>();
        let mut cur = state.0.lock().unwrap();
        if cur.as_deref() == Some(theme.as_str()) {
            return Ok(());
        }
        *cur = Some(theme.clone());
    }
    log::info!("theme -> {theme} (switched in {key})");
    if let Ok(store) = tauri_plugin_store::StoreExt::store(&app, "settings.json") {
        store.set("misTheme", theme.clone()); // the account's theme, as last seen
    }
    push_all(&app, &theme, Some(&key));
    let _ = app.emit_to(SHELL, "nga://app-theme", theme);
    Ok(())
}
