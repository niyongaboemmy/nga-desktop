//! `nga://` links: open NGA at the right place from an email, a Telegram
//! reminder, a QR code on the classroom projector or another program.
//!
//! - `nga://open/<app>/<path…>`  that page in that app, e.g. `nga://open/taskmentor/quizzes/12`
//! - `nga://open/<app>`          the app
//! - `nga://tool/<id>`           a tool, e.g. `nga://tool/timer`
//! - `nga://notifications`       the notifications panel
//!
//! Only the four NGA apps and paths inside them are accepted (navigation.rs
//! rules apply as for any in-app link); anything else is ignored and logged.
//! A link that starts NGA (Windows/Linux pass it on the command line, macOS
//! as an open-URL event) is handled once the window is up; a link clicked
//! while NGA runs reaches the running instance (single-instance + deep-link).

use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_deep_link::DeepLinkExt;

pub const SCHEME: &str = "nga";

#[derive(Debug, PartialEq, Eq)]
pub enum Action {
    App { key: String, path: Option<String> },
    Tool(String),
    Notifications,
}

/// Reads a link (pure, unit-tested). `apps`: the known app keys.
pub fn parse(link: &str, apps: &[&str]) -> Option<Action> {
    let url = url::Url::parse(link.trim()).ok()?;
    if url.scheme() != SCHEME {
        return None;
    }
    // nga://open/taskmentor/quizzes/12 → host "open", path "/taskmentor/quizzes/12"
    let host = url.host_str()?.to_ascii_lowercase();
    let mut segs = url
        .path_segments()
        .map(|s| s.filter(|p| !p.is_empty()).collect::<Vec<_>>())
        .unwrap_or_default();
    match host.as_str() {
        "open" => {
            if segs.is_empty() {
                return None;
            }
            let key = segs.remove(0).to_ascii_lowercase();
            if !apps.contains(&key.as_str()) {
                return None;
            }
            if segs
                .iter()
                .any(|s| *s == ".." || *s == "." || s.contains('\\'))
            {
                return None;
            }
            let mut path = String::new();
            for s in &segs {
                path.push('/');
                path.push_str(s);
            }
            if let Some(q) = url.query() {
                path.push('?');
                path.push_str(q);
            }
            if let Some(f) = url.fragment() {
                path.push('#');
                path.push_str(f);
            }
            Some(Action::App {
                key,
                path: (!path.is_empty()).then_some(path),
            })
        }
        "tool" => {
            let id = segs.first()?.to_ascii_lowercase();
            (segs.len() == 1 && crate::tools::windows::valid_tool_id(&id))
                .then_some(Action::Tool(id))
        }
        "notifications" if segs.is_empty() => Some(Action::Notifications),
        _ => None,
    }
}

pub fn handle<R: Runtime>(app: &AppHandle<R>, link: &str) {
    let shell = app.state_shell_keys();
    let keys: Vec<&str> = shell.iter().map(String::as_str).collect();
    let Some(action) = parse(link, &keys) else {
        log::warn!("deep link ignored (not an NGA link)");
        return;
    };
    log::info!("deep link: {action:?}");
    crate::menus::focus_main(app);
    match action {
        Action::App {
            key,
            path: Some(path),
        } => {
            if let Err(e) = crate::webviews::navigate_app(app, &key, &path) {
                log::warn!("deep link: couldn't open {key}: {e}");
            }
        }
        Action::App { key, path: None } => {
            let _ = crate::webviews::open_app(app, &key, None);
        }
        Action::Tool(id) => crate::overlay::show(app, &format!("tool:{id}")),
        Action::Notifications => {
            let _ = app.emit_to(crate::webviews::SHELL, "nga://menu", "notices".to_string());
        }
    }
}

/// The app keys from the registry (owned, so no state lock is held while handling).
trait ShellKeys {
    fn state_shell_keys(&self) -> Vec<String>;
}
impl<R: Runtime> ShellKeys for AppHandle<R> {
    fn state_shell_keys(&self) -> Vec<String> {
        use tauri::Manager;
        self.state::<crate::webviews::Shell>()
            .apps
            .iter()
            .map(|a| a.key.to_string())
            .collect()
    }
}

/// Startup: register the scheme where it's per-user (Windows/Linux), listen for
/// links, and handle the one NGA was started with.
pub fn init<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(any(windows, target_os = "linux"))]
    if let Err(e) = app.deep_link().register_all() {
        log::warn!("nga:// links not registered: {e}");
    }
    let h = app.clone();
    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            let h2 = h.clone();
            let link = url.to_string();
            let _ = h.run_on_main_thread(move || handle(&h2, &link));
        }
    });
    if let Ok(Some(urls)) = app.deep_link().get_current() {
        let h = app.clone();
        tauri::async_runtime::spawn(async move {
            // Let the shell come up (and MIS sign in) before opening a page.
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            for url in urls {
                let h2 = h.clone();
                let link = url.to_string();
                let _ = h.run_on_main_thread(move || handle(&h2, &link));
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const APPS: [&str; 4] = ["mis", "taskmentor", "tendo", "tupo"];

    #[test]
    fn opens_pages_inside_known_apps() {
        assert_eq!(
            parse("nga://open/taskmentor/quizzes/12", &APPS),
            Some(Action::App {
                key: "taskmentor".into(),
                path: Some("/quizzes/12".into())
            })
        );
        assert_eq!(
            parse(
                "nga://open/MIS/my-office-hours?week=2026-10-05#today",
                &APPS
            ),
            Some(Action::App {
                key: "mis".into(),
                path: Some("/my-office-hours?week=2026-10-05#today".into())
            })
        );
        assert_eq!(
            parse("nga://open/tupo", &APPS),
            Some(Action::App {
                key: "tupo".into(),
                path: None
            })
        );
    }

    #[test]
    fn tools_and_notifications() {
        assert_eq!(
            parse("nga://tool/timer", &APPS),
            Some(Action::Tool("timer".into()))
        );
        assert_eq!(
            parse("nga://notifications", &APPS),
            Some(Action::Notifications)
        );
        // URL parsing resolves dot segments, so this is just the (unknown) tool "etc".
        assert_eq!(
            parse("nga://tool/../../etc", &APPS),
            Some(Action::Tool("etc".into()))
        );
        assert_eq!(parse("nga://tool/timer/extra", &APPS), None);
        assert_eq!(parse("nga://tool/Timer!", &APPS), None);
    }

    #[test]
    fn refuses_anything_else() {
        for bad in [
            "https://evil.example/quizzes",
            "nga://open/evil/x",
            "nga://open/",
            "nga://open/mis/../../secret",
            "nga://open/mis/%2e%2e/admin",
            "nga://format/c",
            "javascript:alert(1)",
            "nga://notifications/extra",
            "",
        ] {
            assert_eq!(parse(bad, &APPS), None, "{bad}");
        }
    }
}
