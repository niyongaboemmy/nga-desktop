//! A floating layer over the whole NGA window: the ⌘K palette and anything
//! else that must sit ON TOP of an app.
//!
//! Native app webviews always draw above the shell's HTML, so the shell
//! can't float anything over an app. This is a separate transparent,
//! frameless window that we keep exactly over the main window (moved and
//! resized with it; on Windows it's also owned by it). It is NOT a macOS child
//! window: `addChildWindow` puts a child on screen even while "hidden", and an
//! invisible window over NGA swallowed every click. While closed it is hidden
//! AND ignores the mouse, so it can never block the app. It loads the
//! shell's own page in overlay mode (`index.html?overlay=1`), dims the app
//! behind it, and closes when it loses focus, like Spotlight.
//!
//! It's created hidden at start-up, so opening is instant.

use crate::webviews::WINDOW;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

pub const OVERLAY: &str = "overlay";

/// What the overlay shows: "palette", "shortcuts", "tools" or "tool:<id>".
static VIEW: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

/// The palette closes when you click elsewhere, like Spotlight. A tool modal
/// stays: a date picker, a save dialog or a quick look at another app must not
/// throw away what you were doing (Esc, ✕ or a click on the backdrop close it).
pub fn closes_on_blur(view: &str) -> bool {
    view == "palette" || view == "shortcuts"
}

pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let main = app.get_window(WINDOW).ok_or(tauri::Error::WindowNotFound)?;
    let builder =
        WebviewWindowBuilder::new(app, OVERLAY, WebviewUrl::App("index.html?overlay=1".into()))
            .additional_browser_args(&crate::registry::browser_args())
            .title("NGA")
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .resizable(false)
            .skip_taskbar(true)
            .visible(false)
            .focused(false);
    #[cfg(windows)]
    let builder = builder.owner_raw(main.hwnd()?);
    #[cfg(not(windows))]
    let _ = &main;
    let overlay = builder.build()?;
    let _ = overlay.set_ignore_cursor_events(true);
    let _ = overlay.hide();
    let handle = app.clone();
    overlay.on_window_event(move |event| {
        // Clicking anywhere outside (another app, the NGA window itself) closes it.
        if let tauri::WindowEvent::Focused(false) = event {
            if closes_on_blur(&VIEW.lock().unwrap()) {
                hide(&handle);
            }
        }
    });
    Ok(())
}

/// Cover the main window's content area exactly. Only while open: moving or
/// resizing a hidden window on macOS can put it back on screen.
pub fn fit<R: Runtime>(app: &AppHandle<R>) {
    if is_open(app) {
        place(app);
    }
}

fn place<R: Runtime>(app: &AppHandle<R>) {
    let (Some(main), Some(overlay)) = (app.get_window(WINDOW), app.get_webview_window(OVERLAY))
    else {
        return;
    };
    if let (Ok(pos), Ok(size)) = (main.inner_position(), main.inner_size()) {
        let _ = overlay.set_position(pos);
        let _ = overlay.set_size(size);
    }
}

pub fn is_open<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.get_webview_window(OVERLAY)
        .and_then(|o| o.is_visible().ok())
        .unwrap_or(false)
}

/// Show the overlay with one of its views ("palette").
pub fn show<R: Runtime>(app: &AppHandle<R>, view: &str) {
    let Some(overlay) = app.get_webview_window(OVERLAY) else {
        return;
    };
    place(app);
    *VIEW.lock().unwrap() = view.to_string();
    let _ = app.emit_to(OVERLAY, "nga://overlay", view.to_string());
    let _ = overlay.set_ignore_cursor_events(false);
    let _ = overlay.show();
    let _ = overlay.set_focus();
}

pub fn hide<R: Runtime>(app: &AppHandle<R>) {
    if let Some(overlay) = app.get_webview_window(OVERLAY) {
        // Always make it click-through, even if it already looks hidden.
        let _ = overlay.set_ignore_cursor_events(true);
        if overlay.is_visible().unwrap_or(false) {
            let _ = overlay.hide();
            let _ = app.emit_to(OVERLAY, "nga://overlay", "closed".to_string());
            if let Some(main) = app.get_window(WINDOW) {
                crate::notifications::INTERNAL_FOCUS
                    .store(true, std::sync::atomic::Ordering::SeqCst);
                let _ = main.set_focus();
            }
        }
    }
}

pub fn toggle<R: Runtime>(app: &AppHandle<R>, view: &str) {
    if is_open(app) {
        hide(app);
    } else {
        show(app, view);
    }
}

#[tauri::command]
pub fn overlay_show<R: Runtime>(app: AppHandle<R>, view: String) {
    show(&app, &view);
}

#[tauri::command]
pub fn overlay_hide<R: Runtime>(app: AppHandle<R>) {
    hide(&app);
}

/// The overlay picked an action the main shell carries out (theme, focus mode…).
#[tauri::command]
pub fn overlay_action<R: Runtime>(app: AppHandle<R>, action: String) {
    hide(&app);
    let _ = app.emit_to(crate::webviews::SHELL, "nga://menu", action);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_palette_closes_on_blur() {
        assert!(closes_on_blur("palette"));
        assert!(closes_on_blur("shortcuts"));
        assert!(!closes_on_blur("tools"));
        assert!(!closes_on_blur("tool:calculator"));
    }
}
