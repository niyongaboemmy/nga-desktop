mod auth;
mod autostart;
mod browser_signin;
mod commands;
mod dialogs;
mod i18n;
mod idle;
mod menus;
mod navigation;
mod notifications;
mod os_notify;
mod overlay;
mod registry;
mod theme;
mod tools;
mod tooltip;
mod updates;
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
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&[overlay::OVERLAY, tooltip::TOOLTIP])
                // A Present window must never reopen full screen by surprise.
                .with_filter(|label| !label.starts_with(tools::windows::PRESENT_PREFIX))
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tools::shortcut::plugin())
            .plugin(autostart::plugin());
    }

    #[cfg(desktop)]
    if let Some(key) = updater_pubkey() {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().pubkey(key).build());
    }

    builder
        .manage(Shell::new())
        .manage(notifications::Notifier::default())
        .manage(theme::SharedTheme::default())
        .manage(updates::Pending::default())
        .manage(tools::identity::Current::default())
        .manage(tools::timers::Timers::default())
        .invoke_handler(tauri::generate_handler![
            commands::shell_info,
            updates::update_check,
            updates::update_install,
            updates::update_auto_get,
            updates::update_auto_set,
            autostart::autostart_get,
            autostart::autostart_set,
            i18n::shell_set_lang,
            updates::web_update_check,
            updates::web_update_install,
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
            theme::set_window_theme,
            commands::popup_menu,
            theme::web_theme,
            notifications::notices_list,
            notifications::notices_summary,
            notifications::notices_open,
            notifications::notices_read_all,
            notifications::notices_snooze,
            notifications::notices_clear,
            notifications::os_permission,
            notifications::os_permission_request,
            notifications::os_open_settings,
            notifications::os_test_banner,
            notifications::focus_session,
            notifications::web_notify,
            notifications::web_badge,
            notifications::web_print,
            overlay::overlay_show,
            overlay::overlay_hide,
            overlay::overlay_action,
            browser_signin::signin_cancel,
            webviews::web_fullscreen,
            browser_signin::signin_reopen,
            tools::identity::web_identity,
            tools::identity::tools_identity,
            tools::timers::timers_list,
            tools::timers::timer_create,
            tools::timers::timer_action,
            tools::windows::tools_window_open,
            tools::windows::tools_displays,
            tools::files::tools_save_file,
            tools::shortcut::tools_shortcut_set,
            tools::api::tools_api,
            tools::api::tools_api_cancel,
            tools::api::web_tools_api_event,
            tooltip::tooltip_show,
            tooltip::tooltip_hide,
        ])
        .setup(|app| {
            grant_bridge(app)?;
            build_main_window(app)?;
            overlay::create(app.handle())?;
            if let Err(e) = tooltip::create(app.handle()) {
                log::warn!("tooltips unavailable: {e}");
            }
            i18n::load(app.handle());
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
            notifications::restore(app.handle());
            auth::spawn(app.handle().clone());
            updates::spawn(app.handle().clone());
            tools::timers::spawn(app.handle().clone());
            tools::shortcut::init(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != WINDOW {
                return;
            }
            let app = window.app_handle();
            match event {
                WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
                    tooltip::hide(app);
                    webviews::relayout(app);
                    overlay::fit(app);
                }
                WindowEvent::Moved(_) => {
                    tooltip::hide(app);
                    overlay::fit(app);
                }
                WindowEvent::Focused(false) => tooltip::hide(app),
                WindowEvent::Focused(true) => {
                    notifications::on_focus(app);
                    updates::on_focus(app);
                }
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
        .permission("allow-web-theme")
        .permission("allow-web-fullscreen")
        // Who is signed in, for the tools (tools/identity.rs refuses every page but MIS's).
        .permission("allow-web-identity")
        // Answers to the tools' MIS API requests (tools/api.rs refuses every page but MIS's).
        .permission("allow-web-tools-api-event")
        // The /apps page's "Update now" (the commands refuse every page but MIS's).
        .permission("allow-web-update-check")
        .permission("allow-web-update-install");
    app.add_capability(cap)
}

/// The main window's first size on a screen with this work area (logical px).
#[derive(Debug, PartialEq)]
struct WindowFit {
    width: f64,
    height: f64,
    min_width: f64,
    min_height: f64,
    maximized: bool,
}

/// 1320×840 where it fits with room to spare; on smaller screens, maximized
/// (a fixed 1320×840 hung off a 1366×768 laptop, and macOS restored that
/// oversized frame after fullscreen, pushing the window off screen).
fn fit_window(work: Option<(f64, f64)>) -> WindowFit {
    let (ww, wh) = work.unwrap_or((1440.0, 900.0));
    let width = 1320.0_f64.min(ww * 0.94).floor();
    let height = 840.0_f64.min(wh * 0.92).floor();
    WindowFit {
        width,
        height,
        min_width: 900.0_f64.min(width),
        min_height: 580.0_f64.min(height),
        maximized: ww < 1400.0 || wh < 860.0,
    }
}

/// The window is built here, not in tauri.conf.json, because child webviews
/// need a bare `Window` (multi-webview) rather than a `WebviewWindow`.
///
/// The shell draws its own title bar (the app tabs live in it):
/// - **macOS:** the system traffic lights float over it (overlay title bar, default
///   position; the shell leaves them room).
/// - **Windows:** no system frame; the shell draws minimise / maximise / close.
fn build_main_window<R: Runtime>(app: &mut App<R>) -> tauri::Result<()> {
    // Fit the screen it opens on: school laptops are often 1366×768 or 1280×720.
    let work = app.primary_monitor().ok().flatten().map(|m| {
        let a = m.work_area().size.to_logical::<f64>(m.scale_factor());
        (a.width, a.height)
    });
    let fit = fit_window(work);
    let builder = WindowBuilder::new(app, WINDOW)
        .title("NGA")
        .inner_size(fit.width, fit.height)
        .min_inner_size(fit.min_width, fit.min_height)
        .maximized(fit.maximized)
        // Started by the login item: stay in the tray / menu bar until asked.
        .visible(!autostart::started_hidden());
    // Centring a maximized window moves it by the difference (macOS put it
    // 31 px past the right edge of a 1024-wide screen).
    let builder = if fit.maximized {
        builder
    } else {
        builder.center()
    };
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
        WebviewBuilder::new(SHELL, WebviewUrl::App("index.html".into()))
            .additional_browser_args(&registry::browser_args()),
        LogicalPosition::new(0.0, 0.0),
        size,
    )?;
    shell.set_auto_resize(true)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn big_screens_get_the_usual_window() {
        let f = fit_window(Some((1920.0, 1050.0)));
        assert_eq!((f.width, f.height, f.maximized), (1320.0, 840.0, false));
    }

    #[test]
    fn school_laptops_open_maximized_and_never_larger_than_the_screen() {
        for (w, h) in [(1366.0, 738.0), (1280.0, 680.0), (1024.0, 728.0)] {
            let f = fit_window(Some((w, h)));
            assert!(f.maximized, "{w}x{h}");
            assert!(f.width <= w && f.height <= h, "{w}x{h} -> {f:?}");
            assert!(f.min_width <= f.width && f.min_height <= f.height);
        }
    }
}
