mod commands;
mod dialogs;
mod navigation;
mod registry;
mod webviews;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::webview::WebviewBuilder;
use tauri::window::WindowBuilder;
use tauri::{App, AppHandle, LogicalPosition, Manager, Runtime, WebviewUrl, WindowEvent};
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
        // Must be first: a second launch focuses the running window instead.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            focus_main(app)
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
        .invoke_handler(tauri::generate_handler![
            commands::shell_info,
            commands::open_app,
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
        ])
        .setup(|app| {
            build_main_window(app)?;
            build_menu(app.handle())?;
            build_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != WINDOW {
                return;
            }
            match event {
                WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
                    webviews::relayout(window.app_handle())
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running NGA Desktop");
}

/// The window is built here, not in tauri.conf.json, because child webviews
/// need a bare `Window` (multi-webview) rather than a `WebviewWindow`.
fn build_main_window<R: Runtime>(app: &mut App<R>) -> tauri::Result<()> {
    let window = WindowBuilder::new(app, WINDOW)
        .title("NGA")
        .inner_size(1280.0, 820.0)
        .min_inner_size(960.0, 600.0)
        .center()
        .build()?;
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

fn focus_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_window(WINDOW) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let shell = app.state::<Shell>();
    let mut items: Vec<MenuItem<R>> = Vec::new();
    for a in &shell.apps {
        items.push(MenuItem::with_id(
            app,
            format!("open:{}", a.key),
            a.name,
            true,
            None::<&str>,
        )?);
    }
    let sep = PredefinedMenuItem::separator(app)?;
    let show = MenuItem::with_id(app, "show", "Show NGA", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit NGA", true, None::<&str>)?;
    let menu = Menu::new(app)?;
    for i in &items {
        menu.append(i)?;
    }
    menu.append(&sep)?;
    menu.append(&show)?;
    menu.append(&quit)?;

    let mut tray = TrayIconBuilder::with_id("nga")
        .tooltip("NGA")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "quit" => app.exit(0),
            "show" => focus_main(app),
            id => handle_menu(app, id),
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// The OS menu: the platform default (on macOS its Edit menu is what makes
/// ⌘C/⌘V work inside the web apps) plus Apps and Go menus whose shortcuts
/// work while focus is inside an app page.
fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = Menu::default(app)?;
    let shell = app.state::<Shell>();
    let apps = Submenu::with_id(app, "apps", "Apps", true)?;
    for (i, a) in shell.apps.iter().enumerate() {
        let accel = format!("CmdOrCtrl+{}", i + 1);
        apps.append(&MenuItem::with_id(
            app,
            format!("open:{}", a.key),
            a.name,
            true,
            Some(accel.as_str()),
        )?)?;
    }
    let go = Submenu::with_items(
        app,
        "Go",
        true,
        &[
            &MenuItem::with_id(app, "back", "Back", true, Some("CmdOrCtrl+["))?,
            &MenuItem::with_id(app, "forward", "Forward", true, Some("CmdOrCtrl+]"))?,
            &MenuItem::with_id(app, "reload", "Reload", true, Some("CmdOrCtrl+R"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "print", "Print…", true, Some("CmdOrCtrl+P"))?,
            &MenuItem::with_id(
                app,
                "browser",
                "Open in Browser",
                true,
                Some("CmdOrCtrl+Shift+O"),
            )?,
        ],
    )?;
    menu.append(&apps)?;
    menu.append(&go)?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| handle_menu(app, event.id().as_ref()));
    Ok(())
}

fn handle_menu<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if let Some(key) = id.strip_prefix("open:") {
        focus_main(app);
        let _ = webviews::open_app(app, key, None);
        return;
    }
    let active = webviews::active_webview(app);
    let _ = match (id, active) {
        ("back", Some(wv)) => wv.eval("history.back()"),
        ("forward", Some(wv)) => wv.eval("history.forward()"),
        ("reload", Some(_)) => webviews::reload_active(app),
        ("print", Some(wv)) => wv.print(),
        ("browser", Some(_)) => {
            commands::open_active_in_browser(app.clone()).map_err(|_| tauri::Error::WebviewNotFound)
        }
        _ => Ok(()),
    };
}
