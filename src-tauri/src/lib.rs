mod auth;
mod commands;
mod dialogs;
mod google;
mod menus;
mod navigation;
mod notifications;
mod os_notify;
mod registry;
mod webviews;

use tauri::ipc::CapabilityBuilder;
use tauri::webview::WebviewBuilder;
use tauri::window::WindowBuilder;
#[cfg(target_os = "macos")]
use tauri::RunEvent;
use tauri::{App, AppHandle, LogicalPosition, Manager, Runtime, WebviewUrl, WindowEvent};
use tauri_plugin_store::StoreExt;
use webviews::{Shell, SHELL, WINDOW};

/// Updater public key, supplied at build time by the release workflow
/// (`NGA_UPDATER_PUBKEY`). Without it (local and CI builds) the updater is off.
pub fn updater_pubkey() -> Option<&'static str> {
    option_env!("NGA_UPDATER_PUBKEY").filter(|k| !k.trim().is_empty())
}

pub const UPDATE_ENDPOINTS: &[&str] = &[
    "https://downloads.amashuri.com/desktop/latest.json",
    "https://github.com/niyongaboemmy/nga-desktop/releases/latest/download/latest.json",
];

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        // Must be first: a second launch (or a clicked Windows toast) focuses the running window.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            menus::focus_main(app)
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(2_000_000)
                .build(),
        )
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    if let Some(key) = updater_pubkey() {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().pubkey(key).build());
    }

    builder
        .manage(Shell::new())
        .manage(notifications::Notifier::default())
        .invoke_handler(tauri::generate_handler![
            commands::shell_info,
            commands::open_app,
            commands::navigate_app,
            commands::set_insets,
            commands::set_covered,
            commands::reload_active,
            commands::go_back,
            commands::go_forward,
            commands::print_active,
            commands::open_active_in_browser,
            commands::show_downloads,
            commands::sign_out,
            commands::reset_profile,
            commands::set_window_theme,
            commands::popup_menu,
            commands::web_theme,
            notifications::notices_list,
            notifications::notices_summary,
            notifications::notices_open,
            notifications::notices_read_all,
            notifications::notices_clear,
            notifications::os_permission,
            notifications::os_permission_request,
            notifications::os_open_settings,
            notifications::os_test_banner,
            notifications::focus_session,
            notifications::web_notify,
            notifications::web_badge,
            notifications::web_print,
        ])
        .setup(|app| {
            grant_bridge(app)?;
            build_main_window(app)?;
            menus::build_app_menu(app.handle())?;
            menus::build_tray(app.handle())?;
            let handle = app.handle().clone();
            os_notify::init(move |id| {
                let h = handle.clone();
                let _ = handle.run_on_main_thread(move || {
                    menus::focus_main(&h);
                    notifications::open_notice(&h, id);
                });
            });
            auth::spawn(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != WINDOW {
                return;
            }
            let app = window.app_handle();
            match event {
                WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
                    webviews::relayout(app)
                }
                WindowEvent::Focused(true) => notifications::on_focus(app),
                // Closing the window keeps NGA running (tray / Dock) so the apps
                // stay signed in and notifications keep arriving. Quit from the
                // tray or the app menu.
                WindowEvent::CloseRequested { api, .. } if keep_running(app) => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building NGA Desktop")
        .run(|_app, _event| {
            // macOS: clicking the Dock icon brings the hidden window back.
            // (Windows: the tray icon and a second launch do that.)
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen { .. } = _event {
                menus::focus_main(_app);
            }
        });
}

fn keep_running<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get("keepRunning"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

/// The only IPC the NGA web pages get: the bridge (notifications, badge,
/// print, MIS theme), for their own webview and origin. Built from the
/// registry, so a production binary never trusts a localhost page.
fn grant_bridge<R: Runtime>(app: &mut App<R>) -> tauri::Result<()> {
    let shell = app.state::<Shell>();
    let mut cap = CapabilityBuilder::new("remote-apps").local(false);
    for a in &shell.apps {
        cap = cap
            .webview(webviews::label(a.key))
            .remote(format!("{}/*", a.origin));
    }
    let cap = cap
        .permission("allow-web-notify")
        .permission("allow-web-badge")
        .permission("allow-web-print")
        .permission("allow-web-theme");
    app.add_capability(cap)
}

/// The window is built here, not in tauri.conf.json, because child webviews
/// need a bare `Window` (multi-webview) rather than a `WebviewWindow`.
///
/// The shell draws its own title bar (the app tabs live in it):
/// - **macOS:** the system traffic lights float over it (overlay title bar, default
///   position; the shell leaves them room).
/// - **Windows:** no system frame; the shell draws minimise / maximise / close.
fn build_main_window<R: Runtime>(app: &mut App<R>) -> tauri::Result<()> {
    let builder = WindowBuilder::new(app, WINDOW)
        .title("NGA")
        .inner_size(1320.0, 840.0)
        .min_inner_size(900.0, 580.0)
        .center();
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);
    #[cfg(not(target_os = "macos"))]
    let builder = builder.decorations(false).shadow(true);
    let window = builder.build()?;
    let size = window
        .inner_size()?
        .to_logical::<f64>(window.scale_factor()?);
    let shell = window.add_child(
        WebviewBuilder::new(SHELL, WebviewUrl::App("index.html".into())),
        LogicalPosition::new(0.0, 0.0),
        size,
    )?;
    shell.set_auto_resize(true)?;
    Ok(())
}
