//! Tooltips for the title bar.
//!
//! The NGA app pages are native webviews drawn ABOVE the shell's HTML, so a tooltip
//! drawn by the shell under a title-bar button would be hidden behind the app. This
//! is a tiny transparent window kept above the main window instead: it never takes
//! focus (not focusable) and never takes a click (cursor events pass through). It
//! is created hidden at start-up and moved under the hovered button on demand.

use serde::Serialize;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Runtime, WebviewUrl,
    WebviewWindowBuilder,
};

pub const TOOLTIP: &str = "tooltip";
/// The tooltip window's size (logical px); the bubble sits inside it.
pub const W: f64 = 360.0;
pub const H: f64 = 84.0;

pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let main = app
        .get_window(crate::webviews::WINDOW)
        .ok_or(tauri::Error::WindowNotFound)?;
    let builder =
        WebviewWindowBuilder::new(app, TOOLTIP, WebviewUrl::App("index.html?tooltip=1".into()))
            .title("")
            .inner_size(W, H)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .resizable(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .visible(false)
            .focused(false)
            .focusable(false);
    #[cfg(windows)]
    let builder = builder.owner_raw(main.hwnd()?);
    #[cfg(not(windows))]
    let _ = &main;
    let tip = builder.build()?;
    let _ = tip.set_ignore_cursor_events(true);
    Ok(())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Tip {
    text: String,
    hint: Option<String>,
    keys: Option<String>,
    /// Where the arrow points, from the tooltip window's left edge (logical px).
    arrow: f64,
}

/// Left edge of the tooltip window so the bubble is centred on `center_x`, kept on
/// the screen `[screen_left, screen_right]`. Returns (left, arrow offset). Pure.
pub fn place(center_x: f64, screen_left: f64, screen_right: f64) -> (f64, f64) {
    let mut left = center_x - W / 2.0;
    left = left.max(screen_left + 4.0).min(screen_right - W - 4.0);
    (left, center_x - left)
}

/// Show `text` under the shell element whose bottom-centre is (x, y) in the main
/// window's content coordinates (CSS px).
#[tauri::command]
pub fn tooltip_show<R: Runtime>(
    app: AppHandle<R>,
    text: String,
    hint: Option<String>,
    keys: Option<String>,
    x: f64,
    y: f64,
) -> Result<(), String> {
    let (Some(main), Some(tip)) = (
        app.get_window(crate::webviews::WINDOW),
        app.get_webview_window(TOOLTIP),
    ) else {
        return Ok(());
    };
    if crate::overlay::is_open(&app) || !main.is_focused().unwrap_or(false) {
        return Ok(());
    }
    let scale = main.scale_factor().map_err(|e| e.to_string())?;
    let origin = main
        .inner_position()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale);
    let (screen_left, screen_right) = main
        .current_monitor()
        .ok()
        .flatten()
        .map(|m| {
            let p = m.position().to_logical::<f64>(m.scale_factor());
            let s = m.size().to_logical::<f64>(m.scale_factor());
            (p.x, p.x + s.width)
        })
        .unwrap_or((f64::MIN / 4.0, f64::MAX / 4.0));
    let (left, arrow) = place(origin.x + x, screen_left, screen_right);
    let clip = |s: &str, n: usize| s.trim().chars().take(n).collect::<String>();
    let _ = tip.set_size(LogicalSize::new(W, H));
    let _ = tip.set_position(LogicalPosition::new(left, origin.y + y + 4.0));
    let _ = app.emit_to(
        TOOLTIP,
        "nga://tooltip",
        Tip {
            text: clip(&text, 60),
            hint: hint.map(|h| clip(&h, 90)).filter(|h| !h.is_empty()),
            keys: keys.map(|k| clip(&k, 16)).filter(|k| !k.is_empty()),
            arrow,
        },
    );
    let _ = tip.show();
    Ok(())
}

pub fn hide<R: Runtime>(app: &AppHandle<R>) {
    if let Some(tip) = app.get_webview_window(TOOLTIP) {
        if tip.is_visible().unwrap_or(false) {
            let _ = tip.hide();
        }
    }
}

#[tauri::command]
pub fn tooltip_hide<R: Runtime>(app: AppHandle<R>) {
    hide(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn centred_under_the_button() {
        let (left, arrow) = place(500.0, 0.0, 1440.0);
        assert_eq!(left, 500.0 - W / 2.0);
        assert_eq!(arrow, W / 2.0);
    }

    #[test]
    fn kept_on_screen_with_the_arrow_still_on_the_button() {
        let (left, arrow) = place(1430.0, 0.0, 1440.0);
        assert_eq!(left, 1440.0 - W - 4.0);
        assert_eq!(left + arrow, 1430.0);
        let (left, arrow) = place(10.0, 0.0, 1440.0);
        assert_eq!(left, 4.0);
        assert_eq!(left + arrow, 10.0);
        // A second monitor to the left (negative coordinates).
        let (left, _) = place(-1900.0, -1920.0, 0.0);
        assert_eq!(left, -1916.0);
    }
}
