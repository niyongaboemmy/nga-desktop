//! The Tools Hub's native side (docs/TOOLS_HUB_IMPLEMENTATION_PLAN.md).
//!
//! - `identity`: who is signed in to NGA MIS (reported by the MIS page itself),
//!   so personal tools keep each person's data apart on shared lab computers.
//! - `timers`: countdowns, stopwatches and focus sessions that keep running
//!   (and ring) while the panel is closed or NGA is minimised.
//! - `windows`: a tool in its own small window (pop-out, can stay on top) or
//!   full screen on a projector (present).
//! - `files`: save a tool's output (QR code, note) to Downloads.
//! - `api`: NGA MIS API calls for the tools, made by the MIS page itself (no token here).
//! - `shortcut`: the optional system-wide "quick tools" key.

pub mod api;
pub mod files;
pub mod identity;
pub mod shortcut;
pub mod timers;
pub mod windows;

use tauri::{AppHandle, Emitter, EventTarget, Runtime};

/// Webviews that run the shell's own UI: the main shell, the palette overlay
/// and tool windows. Tool events go to these only, never to the NGA app pages.
pub fn is_shell_label(label: &str) -> bool {
    label == crate::webviews::SHELL
        || label == crate::overlay::OVERLAY
        || label.starts_with(windows::TOOL_PREFIX)
        || label.starts_with(windows::PRESENT_PREFIX)
}

pub fn emit_shell<R: Runtime, S: serde::Serialize + Clone>(
    app: &AppHandle<R>,
    event: &str,
    payload: S,
) {
    let _ = app.emit_filter(event, payload, |t| match t {
        EventTarget::Webview { label }
        | EventTarget::WebviewWindow { label }
        | EventTarget::Window { label } => is_shell_label(label),
        _ => false,
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_events_never_reach_app_pages() {
        assert!(is_shell_label("shell"));
        assert!(is_shell_label("overlay"));
        assert!(is_shell_label("tool-calculator"));
        assert!(is_shell_label("present-timer"));
        assert!(!is_shell_label("app-mis"));
        assert!(!is_shell_label("app-tupo"));
        assert!(!is_shell_label("main"));
    }
}
