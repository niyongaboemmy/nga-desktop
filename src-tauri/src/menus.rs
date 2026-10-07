//! The native menus: the app menu bar, the tray, and popups opened from the
//! shell (a tab's right-click, the toolbar's "more" button). All items end
//! up in `handle`.

use crate::i18n::t;
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
    app.set_menu(app_menu(app)?)?;
    app.on_menu_event(|app, event| handle(app, event.id().as_ref()));
    Ok(())
}

/// The language changed: rebuild the menu bar and the tray menu in it.
pub fn rebuild<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(menu) = app_menu(app) {
        let _ = app.set_menu(menu);
    }
    if let (Some(tray), Ok(menu)) = (app.tray_by_id("nga"), tray_menu(app)) {
        let _ = tray.set_menu(Some(menu));
    }
    crate::notifications::publish(app);
}

fn app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    let shell = app.state::<Shell>();
    let apps = Submenu::with_id(app, "apps", t("menu.apps"), true)?;
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
        t("menu.nextApp"),
        true,
        Some("Ctrl+Tab"),
    )?)?;
    apps.append(&MenuItem::with_id(
        app,
        "prev-app",
        t("menu.prevApp"),
        true,
        Some("Ctrl+Shift+Tab"),
    )?)?;
    apps.append(&PredefinedMenuItem::separator(app)?)?;
    apps.append(&MenuItem::with_id(
        app,
        "palette",
        t("menu.search"),
        true,
        Some("CmdOrCtrl+K"),
    )?)?;
    let go = Submenu::with_items(
        app,
        t("menu.go"),
        true,
        &[
            &MenuItem::with_id(app, "back", t("menu.back"), true, Some("CmdOrCtrl+["))?,
            &MenuItem::with_id(app, "forward", t("menu.forward"), true, Some("CmdOrCtrl+]"))?,
            &MenuItem::with_id(app, "reload", t("menu.reload"), true, Some("CmdOrCtrl+R"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "print", t("menu.print"), true, Some("CmdOrCtrl+P"))?,
            &MenuItem::with_id(
                app,
                "browser",
                t("menu.openBrowser"),
                true,
                Some("CmdOrCtrl+Shift+O"),
            )?,
            &MenuItem::with_id(
                app,
                "copy-link",
                t("menu.copyLink"),
                true,
                Some("CmdOrCtrl+Shift+C"),
            )?,
        ],
    )?;
    let help = Submenu::with_items(
        app,
        t("menu.help"),
        true,
        &[&MenuItem::with_id(
            app,
            "shortcuts",
            t("menu.shortcuts"),
            true,
            Some("CmdOrCtrl+Slash"),
        )?],
    )?;
    let display = Submenu::with_items(
        app,
        t("menu.display"),
        true,
        &[
            &MenuItem::with_id(
                app,
                "focus",
                t("menu.focus"),
                true,
                Some("CmdOrCtrl+Shift+F"),
            )?,
            &MenuItem::with_id(
                app,
                "notices",
                t("menu.notifications"),
                true,
                Some("CmdOrCtrl+Shift+N"),
            )?,
            &MenuItem::with_id(
                app,
                "tools",
                t("menu.tools"),
                true,
                Some("CmdOrCtrl+Shift+T"),
            )?,
            &MenuItem::with_id(
                app,
                "theme",
                t("menu.theme"),
                true,
                Some("CmdOrCtrl+Shift+L"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                "zoom-in",
                t("menu.zoomIn"),
                true,
                Some("CmdOrCtrl+Equal"),
            )?,
            &MenuItem::with_id(
                app,
                "zoom-out",
                t("menu.zoomOut"),
                true,
                Some("CmdOrCtrl+Minus"),
            )?,
            &MenuItem::with_id(
                app,
                "zoom-reset",
                t("menu.actualSize"),
                true,
                Some("CmdOrCtrl+Digit0"),
            )?,
        ],
    )?;
    menu.append(&apps)?;
    menu.append(&go)?;
    menu.append(&display)?;
    menu.append(&help)?;
    Ok(menu)
}

pub fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    use tauri::tray::TrayIconBuilder;
    let menu = tray_menu(app)?;
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

fn tray_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
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
        t("menu.notifications"),
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "show",
        t("tray.show"),
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "quit",
        t("tray.quit"),
        true,
        None::<&str>,
    )?)?;
    Ok(menu)
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
                t("popup.open"),
                true,
                None::<&str>,
            )?)?;
            menu.append(&MenuItem::with_id(
                app,
                format!("reload:{key}"),
                t("menu.reload"),
                true,
                None::<&str>,
            )?)?;
            menu.append(&MenuItem::with_id(
                app,
                format!("home:{key}"),
                t("popup.home"),
                true,
                None::<&str>,
            )?)?;
            menu.append(&MenuItem::with_id(
                app,
                format!("browser:{key}"),
                t("menu.openBrowser"),
                true,
                None::<&str>,
            )?)?;
            menu.append(&PredefinedMenuItem::separator(app)?)?;
            let muted = crate::notifications::is_muted(app, key);
            menu.append(&CheckMenuItem::with_id(
                app,
                format!("mute:{key}"),
                t("popup.mute"),
                true,
                muted,
                None::<&str>,
            )?)?;
        }
        ("theme", current) => {
            for (id, label) in [
                ("mis", t("popup.themeMis")),
                ("light", t("popup.light")),
                ("dark", t("popup.dark")),
                ("system", t("popup.system")),
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
                t("menu.print"),
                active,
                Some("CmdOrCtrl+P"),
            )?)?;
            menu.append(&MenuItem::with_id(
                app,
                "browser",
                t("menu.openBrowser"),
                active,
                Some("CmdOrCtrl+Shift+O"),
            )?)?;
            menu.append(&MenuItem::with_id(
                app,
                "downloads",
                t("popup.downloads"),
                true,
                None::<&str>,
            )?)?;
            menu.append(&PredefinedMenuItem::separator(app)?)?;
            menu.append(&MenuItem::with_id(
                app,
                "zoom-in",
                t("menu.zoomIn"),
                active,
                Some("CmdOrCtrl+Equal"),
            )?)?;
            menu.append(&MenuItem::with_id(
                app,
                "zoom-out",
                t("menu.zoomOut"),
                active,
                Some("CmdOrCtrl+Minus"),
            )?)?;
            menu.append(&MenuItem::with_id(
                app,
                "zoom-reset",
                t("menu.actualSize"),
                active,
                Some("CmdOrCtrl+Digit0"),
            )?)?;
            menu.append(&PredefinedMenuItem::separator(app)?)?;
            menu.append(&MenuItem::with_id(
                app,
                "focus",
                t("menu.focus"),
                active,
                Some("CmdOrCtrl+Shift+F"),
            )?)?;
            menu.append(&MenuItem::with_id(
                app,
                "settings",
                t("popup.settings"),
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
        "quit" => crate::updates::quit(app),
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
                    let _ = app.emit_to(SHELL, "nga://toast", t("toast.linkCopied").to_string());
                }
            }
        }
        "focus" | "notices" | "theme" | "settings" | "tools" => {
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
