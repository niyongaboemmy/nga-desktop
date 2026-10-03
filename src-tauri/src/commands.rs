//! Commands the local shell UI may call. Remote NGA pages get none of these:
//! `capabilities/shell.json` grants them to the `shell` webview only, and
//! build.rs puts every command behind that permission.

use crate::registry::{self, AppDef};
use crate::webviews::{self, Shell, SHELL};
use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

type CmdResult<T = ()> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellInfo {
    pub version: String,
    pub env: &'static str,
    pub os: &'static str,
    pub webview: String,
    pub apps: Vec<AppDef>,
    pub updater: bool,
}

#[tauri::command]
pub fn shell_info<R: Runtime>(app: AppHandle<R>) -> ShellInfo {
    let shell = app.state::<Shell>();
    ShellInfo {
        version: app.package_info().version.to_string(),
        env: match shell.env {
            registry::Env::Production => "production",
            registry::Env::Development => "development",
        },
        os: std::env::consts::OS,
        webview: tauri::webview_version().unwrap_or_default(),
        apps: shell.apps.clone(),
        updater: crate::updater_pubkey().is_some(),
    }
}

#[tauri::command]
pub fn open_app<R: Runtime>(app: AppHandle<R>, key: String) -> CmdResult {
    webviews::open_app(&app, &key, None).map_err(err)
}

/// The shell reports how much room its sidebar/header take (logical px).
#[tauri::command]
pub fn set_insets<R: Runtime>(app: AppHandle<R>, left: f64, top: f64) {
    webviews::set_insets(&app, left, top);
}

/// A shell page (Settings, About, offline) is showing over the app area.
#[tauri::command]
pub fn set_covered<R: Runtime>(app: AppHandle<R>, covered: bool) {
    webviews::set_covered(&app, covered);
}

#[tauri::command]
pub fn reload_active<R: Runtime>(app: AppHandle<R>) -> CmdResult {
    webviews::reload_active(&app).map_err(err)
}

#[tauri::command]
pub fn go_back<R: Runtime>(app: AppHandle<R>) -> CmdResult {
    match webviews::active_webview(&app) {
        Some(wv) => wv.eval("history.back()").map_err(err),
        None => Ok(()),
    }
}

#[tauri::command]
pub fn go_forward<R: Runtime>(app: AppHandle<R>) -> CmdResult {
    match webviews::active_webview(&app) {
        Some(wv) => wv.eval("history.forward()").map_err(err),
        None => Ok(()),
    }
}

/// Native print of the active app (window.print() is unreliable in WKWebView).
#[tauri::command]
pub fn print_active<R: Runtime>(app: AppHandle<R>) -> CmdResult {
    match webviews::active_webview(&app) {
        Some(wv) => wv.print().map_err(err),
        None => Ok(()),
    }
}

#[tauri::command]
pub fn open_active_in_browser<R: Runtime>(app: AppHandle<R>) -> CmdResult {
    let Some(wv) = webviews::active_webview(&app) else {
        return Ok(());
    };
    let url = wv.url().map_err(err)?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(err)
}

#[tauri::command]
pub fn show_downloads<R: Runtime>(app: AppHandle<R>, path: Option<String>) -> CmdResult {
    match path {
        Some(p) if !p.is_empty() => app.opener().reveal_item_in_dir(p).map_err(err),
        _ => {
            let dir = app.path().download_dir().map_err(err)?;
            app.opener()
                .open_path(dir.display().to_string(), None::<&str>)
                .map_err(err)
        }
    }
}

/// Sign out of every NGA app on this computer.
///
/// 1. Inside the MIS webview (MIS's own origin, so the shell never reads the
///    token), call `POST /auth/logout`: MIS bumps token_version and sends the
///    back-channel logout to Task Mentor, Tendo and Tupo.
/// 2. Wipe the shared browsing profile (cookies, localStorage, caches) so
///    nothing of this user is left on a shared school computer.
#[tauri::command]
pub async fn sign_out<R: Runtime>(app: AppHandle<R>) -> CmdResult {
    let mis_key = {
        let shell = app.state::<Shell>();
        registry::identity_provider(&shell.apps).key
    };
    if let Some(mis) = app.get_webview(&webviews::label(mis_key)) {
        let js = format!(
            "(function(){{try{{var t=localStorage.getItem('token');if(t){{fetch('{api}/auth/logout',{{method:'POST',credentials:'include',keepalive:true,headers:{{Authorization:'Bearer '+t}}}}).catch(function(){{}});}}}}catch(e){{}}}})();",
            api = registry::mis_api_base()
        );
        let _ = mis.eval(js);
        tokio::time::sleep(Duration::from_millis(1500)).await;
    }
    reset_profile(app).await
}

/// Settings → Troubleshooting: forget everything (no server call).
#[tauri::command]
pub async fn reset_profile<R: Runtime>(app: AppHandle<R>) -> CmdResult {
    // All webviews share one data store, so clearing through the shell clears all.
    if let Some(shell) = app.get_webview(SHELL) {
        shell.clear_all_browsing_data().map_err(err)?;
    }
    webviews::close_all_apps(&app);
    webviews::forget_sso(&app);
    let _ = app.emit_to(SHELL, "nga://signed-out", ());
    Ok(())
}
