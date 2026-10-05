//! The native menus: the app menu bar, the tray, and popups opened from the
//! shell (a tab's right-click, the toolbar's "more" button). All items end
//! up in `handle`.

use crate::webviews::{self, Shell, SHELL, WINDOW};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub fn focus_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_window(WINDOW) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Menu bar: the platform default (on macOS its Edit menu is what makes ⌘C/⌘V
/// work inside the web apps) plus Apps, Go and Display, whose shortcuts work
/// while focus is inside an app page.
pub fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
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
    apps.append(&PredefinedMenuItem::separator(app)?)?;
    apps.append(&MenuItem::with_id(
        app,
        "next-app",
        "Next App",
        true,
        Some("Ctrl+Tab"),
    )?)?;
    apps.append(&MenuItem::with_id(
        app,
        "prev-app",
        "Previous App",
        true,
        Some("Ctrl+Shift+Tab"),
    )?)?;
    apps.append(&PredefinedMenuItem::separator(app)?)?;
    apps.append(&MenuItem::with_id(
        app,
        "palette",
        "Search NGA…",
        true,
        Some("CmdOrCtrl+K"),
    )?)?;
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
            &MenuItem::with_id(
                app,
                "copy-link",
                "Copy Page Link",
                true,
                Some("CmdOrCtrl+Shift+C"),
            )?,
        ],
    )?;
    let help = Submenu::with_items(
        app,
        "Help",
        true,
        &[&MenuItem::with_id(
            app,
            "shortcuts",
            "Keyboard Shortcuts",
            true,
            Some("CmdOrCtrl+Slash"),
        )?],
    )?;
    let display = Submenu::with_items(
        app,
        "Display",
        true,
        &[
            &MenuItem::with_id(app, "focus", "Focus Mode", true, Some("CmdOrCtrl+Shift+F"))?,
            &MenuItem::with_id(
                app,
                "notices",
                "Notifications",
                true,
                Some("CmdOrCtrl+Shift+N"),
            )?,
            &MenuItem::with_id(
                app,
                "theme",
                "Switch Light / Dark",
                true,
                Some("CmdOrCtrl+Shift+L"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "zoom-in", "Zoom In", true, Some("CmdOrCtrl+Equal"))?,
            &MenuItem::with_id(app, "zoom-out", "Zoom Out", true, Some("CmdOrCtrl+Minus"))?,
            &MenuItem::with_id(
                app,
                "zoom-reset",
                "Actual Size",
                true,
                Some("CmdOrCtrl+Digit0"),
            )?,
        ],
    )?;
    menu.append(&apps)?;
    menu.append(&go)?;
    menu.append(&display)?;
    menu.append(&help)?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| handle(app, event.id().as_ref()));
    Ok(())
}

pub fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    use tauri::tray::TrayIconBuilder;
    let shell = app.state::<Shell>();
    let menu = Menu::new(app)?;
    for a in &shell.apps {
        menu.append(&MenuItem::with_id(
            app,
            format!("open:{}", a.key),
            a.name,
            true,
            None::<&str>,
        )?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "notices",
        "Notifications",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "show",
        "Show NGA",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "quit",
        "Quit NGA",
        true,
        None::<&str>,
    )?)?;
    let mut tray = TrayIconBuilder::with_id("nga")
        .tooltip("NGA")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle(app, event.id().as_ref()));
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Popup menus the shell asks for. `key` is the app a tab belongs to.
pub fn popup<R: Runtime>(
    app: &AppHandle<R>,
    kind: &str,
    key: Option<&str>,
) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;
    match (kind, key) {
        ("tab", Some(key)) => {
            menu.append(&MenuItem::with_id(
                app,
                format!("open:{key}"),
                "Open",
                true,
                None::<&str>,
            )?)?;
            menu.append(&MenuItem::with_id(
                app,
                format!("reload:{key}"),
                "Reload",
                true,
                None::<&str>,
            )?)?;
            menu.append(&MenuItem::with_id(
                app,
                format!("home:{key}"),
                "Go to Start Page",
                true,
                None::<&str>,
            )?)?;
            menu.append(&MenuItem::with_id(
                app,
                format!("browser:{key}"),
                "Open in Browser",
                true,
                None::<&str>,
            )?)?;
            menu.append(&PredefinedMenuItem::separator(app)?)?;
            let muted = crate::notifications::is_muted(app, key);
            menu.append(&CheckMenuItem::with_id(
                app,
                format!("mute:{key}"),
                "Mute Notifications",
                true,
                muted,
                None::<&str>,
            )?)?;
        }
        ("theme", current) => {
            for (id, label) in [
                ("mis", "Follow My NGA Account"),
                ("light", "Light"),
                ("dark", "Dark"),
                ("system", "Match This Computer"),
            ] {
                let item = CheckMenuItem::with_id(
                    app,
                    format!("theme:{id}"),
                    label,
                    true,
                    current == Some(id),
                    None::<&str>,
                )?;
                menu.append(&item)?;
                if id == "mis" {
                    menu.append(&PredefinedMenuItem::separator(app)?)?;
                }
            }
        }
        _ => {
            let active = webviews::active_webview(app).is_some();
            menu.append(&MenuItem::with_id(
                app,
                "print",
                "Print…",
                active,
                Some("CmdOrCtrl+P"),
            )?)?;
            menu.append(&MenuItem::with_id(
                app,
                "browser",
                "Open in Browser",
                active,
                Some("CmdOrCtrl+Shift+O"),
            )?)?;
            menu.append(&MenuItem::with_id(
                app,
                "downloads",
                "Show Downloads",
                true,
                None::<&str>,
            )?)?;
            menu.append(&PredefinedMenuItem::separator(app)?)?;
            menu.append(&MenuItem::with_id(
                app,
                "zoom-in",
                "Zoom In",
                active,
                Some("CmdOrCtrl+Equal"),
            )?)?;
            menu.append(&MenuItem::with_id(
                app,
                "zoom-out",
                "Zoom Out",
                active,
                Some("CmdOrCtrl+Minus"),
            )?)?;
            menu.append(&MenuItem::with_id(
                app,
                "zoom-reset",
                "Actual Size",
                active,
                Some("CmdOrCtrl+Digit0"),
            )?)?;
            menu.append(&PredefinedMenuItem::separator(app)?)?;
            menu.append(&MenuItem::with_id(
                app,
                "focus",
                "Focus Mode",
                active,
                Some("CmdOrCtrl+Shift+F"),
            )?)?;
            menu.append(&MenuItem::with_id(
                app,
                "settings",
                "Settings",
                true,
                Some("CmdOrCtrl+Comma"),
            )?)?;
        }
    }
    Ok(menu)
}

pub fn handle<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if let Some((verb, key)) = id.split_once(':') {
        match verb {
            "open" => {
                focus_main(app);
                let _ = webviews::open_app(app, key, None);
            }
            "reload" => {
                if let Some(wv) = app.get_webview(&webviews::label(key)) {
                    let _ = wv.reload();
                }
            }
            "home" => {
                let shell = app.state::<Shell>();
                if let Some(def) = crate::registry::find(&shell.apps, key) {
                    let _ = webviews::open_app(app, key, Some(def.start_url()));
                }
            }
            "browser" => {
                if let Some(url) = app
                    .get_webview(&webviews::label(key))
                    .and_then(|wv| webviews::page_url(&wv))
                {
                    use tauri_plugin_opener::OpenerExt;
                    let _ = app.opener().open_url(url.as_str(), None::<&str>);
                }
            }
            "mute" => crate::notifications::toggle_mute(app, key),
            "theme" => {
                let _ = app.emit_to(SHELL, "nga://menu", id.to_string());
            }
            _ => {}
        }
        return;
    }
    match id {
        "quit" => app.exit(0),
        "show" => focus_main(app),
        "palette" => {
            focus_main(app);
            crate::overlay::toggle(app, "palette");
        }
        "shortcuts" => {
            focus_main(app);
            crate::overlay::toggle(app, "shortcuts");
        }
        "next-app" => cycle(app, 1),
        "prev-app" => cycle(app, -1),
        "copy-link" => {
            if let Some(url) = webviews::active_webview(app).and_then(|wv| webviews::page_url(&wv))
            {
                use tauri_plugin_clipboard_manager::ClipboardExt;
                if app.clipboard().write_text(url.to_string()).is_ok() {
                    let _ = app.emit_to(SHELL, "nga://toast", "Link copied".to_string());
                }
            }
        }
        "focus" | "notices" | "theme" | "settings" => {
            focus_main(app);
            let _ = app.emit_to(SHELL, "nga://menu", id.to_string());
        }
        "zoom-in" => webviews::zoom_active(app, 1),
        "zoom-out" => webviews::zoom_active(app, -1),
        "zoom-reset" => webviews::zoom_active(app, 0),
        "downloads" => {
            let _ = crate::commands::show_downloads(app.clone(), None);
        }
        _ => {
            let Some(wv) = webviews::active_webview(app) else {
                return;
            };
            let _ = match id {
                "back" => wv.eval("history.back()"),
                "forward" => wv.eval("history.forward()"),
                "reload" => webviews::reload_active(app),
                "print" => wv.print(),
                "browser" => crate::commands::open_active_in_browser(app.clone())
                    .map_err(|_| tauri::Error::WebviewNotFound),
                _ => Ok(()),
            };
        }
    }
}

/// Ctrl+Tab / Ctrl+Shift+Tab: the next / previous app, like browser tabs.
fn cycle<R: Runtime>(app: &AppHandle<R>, step: i32) {
    let shell = app.state::<Shell>();
    let keys: Vec<&'static str> = shell.apps.iter().map(|a| a.key).collect();
    let current = shell
        .active()
        .and_then(|k| keys.iter().position(|x| *x == k))
        .unwrap_or(0) as i32;
    let n = keys.len() as i32;
    let next = keys[((current + step).rem_euclid(n)) as usize];
    focus_main(app);
    let _ = webviews::open_app(app, next, None);
}
