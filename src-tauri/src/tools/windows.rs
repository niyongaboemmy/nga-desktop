//! A tool in its own window.
//!
//! - **Pop-out** (`tool-<id>`): a small window that can stay on top of other
//!   apps (a timer over a lesson, the calculator over homework). Its size and
//!   place are remembered.
//! - **Present** (`present-<id>`): full screen on a chosen display, for the
//!   projector. Never remembered (window-state filter in lib.rs), so it never
//!   reopens full screen by surprise.
//!
//! Both load the shell's own page (`index.html?tool=<id>`), never a remote page.
//! Windows are created off the calling thread (see webviews::create_later:
//! creating a WebView2 inside a command can deadlock on Windows).

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

pub const TOOL_PREFIX: &str = "tool-";
/// Windows being created right now (two quick clicks must not race to create one twice).
static CREATING: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());
pub const PRESENT_PREFIX: &str = "present-";

/// Tool ids are short lowercase slugs from the shell's registry.
pub fn valid_tool_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 32
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Display {
    pub index: usize,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub primary: bool,
    /// The display the NGA window is on.
    pub current: bool,
}

#[tauri::command]
pub fn tools_displays<R: Runtime>(app: AppHandle<R>) -> Vec<Display> {
    let main = app.get_window(crate::webviews::WINDOW);
    let current = main
        .as_ref()
        .and_then(|w| w.current_monitor().ok().flatten());
    let primary = main
        .as_ref()
        .and_then(|w| w.primary_monitor().ok().flatten());
    let same = |a: &tauri::Monitor, b: &Option<tauri::Monitor>| {
        b.as_ref()
            .is_some_and(|b| a.position() == b.position() && a.size() == b.size())
    };
    main.and_then(|w| w.available_monitors().ok())
        .unwrap_or_default()
        .iter()
        .enumerate()
        .map(|(index, m)| Display {
            index,
            name: m
                .name()
                .cloned()
                .unwrap_or_else(|| format!("Display {}", index + 1)),
            width: m.size().width,
            height: m.size().height,
            primary: same(m, &primary),
            current: same(m, &current),
        })
        .collect()
}

/// Open (or bring forward) a tool's own window. `present`: full screen on
/// `display` (default: a display other than NGA's, if there is one).
#[tauri::command]
pub fn tools_window_open<R: Runtime>(
    app: AppHandle<R>,
    tool: String,
    title: String,
    present: bool,
    on_top: Option<bool>,
    display: Option<usize>,
) -> Result<(), String> {
    if !valid_tool_id(&tool) {
        return Err("bad tool".into());
    }
    let title: String = title.trim().chars().take(60).collect();
    let label = format!(
        "{}{tool}",
        if present { PRESENT_PREFIX } else { TOOL_PREFIX }
    );
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    {
        let mut creating = CREATING.lock().unwrap();
        if creating.contains(&label) {
            return Ok(());
        }
        creating.push(label.clone());
    }
    log::info!(
        "tools: {} window for {tool}",
        if present { "present" } else { "pop-out" }
    );
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let url = format!(
            "index.html?tool={tool}{}",
            if present { "&present=1" } else { "" }
        );
        let mut b = WebviewWindowBuilder::new(&app2, &label, WebviewUrl::App(url.into()))
            .additional_browser_args(&crate::registry::browser_args())
            .title(if title.is_empty() {
                "NGA Tools".to_string()
            } else {
                format!("{title} · NGA")
            })
            .disable_drag_drop_handler()
            .min_inner_size(260.0, 220.0)
            .inner_size(380.0, 540.0)
            .always_on_top(on_top.unwrap_or(false) && !present);
        #[cfg(target_os = "macos")]
        {
            b = b
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true);
        }
        #[cfg(not(target_os = "macos"))]
        {
            b = b.decorations(false).shadow(true);
        }
        if present {
            // Placed on the chosen display first, then full screen from the
            // start (macOS ignores set_fullscreen on a window still appearing).
            if let Some(m) = pick_display(&app2, display) {
                let p = m.position().to_logical::<f64>(m.scale_factor());
                b = b.position(p.x + 40.0, p.y + 40.0);
            }
            b = b.fullscreen(true);
        } else {
            b = b.center();
        }
        match b.build() {
            Ok(w) => {
                let _ = w.set_focus();
            }
            Err(e) => log::warn!("tools: couldn't open the window: {e}"),
        }
        CREATING.lock().unwrap().retain(|l| l != &label);
    });
    Ok(())
}

/// The chosen display, else the first one NGA isn't on, else NGA's.
fn pick_display<R: Runtime>(app: &AppHandle<R>, wanted: Option<usize>) -> Option<tauri::Monitor> {
    let main = app.get_window(crate::webviews::WINDOW)?;
    let all = main.available_monitors().ok()?;
    if let Some(i) = wanted {
        if let Some(m) = all.get(i) {
            return Some(m.clone());
        }
    }
    let current = main.current_monitor().ok().flatten();
    all.iter()
        .find(|m| {
            current
                .as_ref()
                .is_none_or(|c| c.position() != m.position())
        })
        .cloned()
        .or(current)
}

/// Close every tool window (sign-out: a present window may show a class list).
pub fn close_all<R: Runtime>(app: &AppHandle<R>) {
    for (label, w) in app.webview_windows() {
        if label.starts_with(TOOL_PREFIX) || label.starts_with(PRESENT_PREFIX) {
            let _ = w.close();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_registry_slugs_open_windows() {
        assert!(valid_tool_id("calculator"));
        assert!(valid_tool_id("date-calc"));
        assert!(!valid_tool_id(""));
        assert!(!valid_tool_id("../etc"));
        assert!(!valid_tool_id("Calc"));
        assert!(!valid_tool_id("a?b=c"));
        assert!(!valid_tool_id(&"a".repeat(33)));
    }
}
