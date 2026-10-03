//! Where a URL requested by an app webview may go. Pure functions, table-tested.
//!
//! Three hooks, because the engines differ:
//! - `frame_navigation` runs from `on_navigation`. WebView2 calls it for the
//!   main frame only, but WKWebView calls it for EVERY frame (iframes too), so
//!   it must stay permissive for http(s) or every embedded YouTube/Docs player
//!   would be sent to the browser. It only filters schemes.
//! - `main_frame_allowed` runs on page-load start (main frame only, both
//!   engines). It is the real allow-list: a top-level page outside NGA is
//!   sent to the system browser and the webview goes back to where it was.
//! - `new_window` runs from `on_new_window` (`target=_blank`, `window.open`).
//!
//! In-place navigation between NGA origins is ALLOWED on purpose: the SSO
//! handshake is a top-level redirect spoke → mis.amashuri.com/login →
//! spoke/sso/callback inside the same webview. Only *new-window* requests to
//! another NGA app switch tabs (that's how the MIS/Tupo app switchers launch).

use crate::registry::{AppDef, Env};
use url::Url;

#[derive(Debug, PartialEq, Eq)]
pub enum Frame {
    Allow,
    /// Hand to the OS (mailto:, tel:) and cancel.
    OpenWithOs(Url),
    Block,
}

pub fn frame_navigation(url: &Url) -> Frame {
    match url.scheme() {
        "https" | "http" | "about" | "blob" | "data" => Frame::Allow,
        "mailto" | "tel" | "sms" => Frame::OpenWithOs(url.clone()),
        _ => Frame::Block,
    }
}

/// Is `url` a host this build trusts to render as a top-level page?
pub fn trusted(env: Env, apps: &[AppDef], url: &Url) -> bool {
    if apps.iter().any(|a| a.owns(url)) {
        return true;
    }
    match env {
        // Any NGA subdomain: APIs that serve files/PDFs, live.amashuri.com, etc.
        Env::Production => {
            url.scheme() == "https"
                && url
                    .host_str()
                    .is_some_and(|h| h == "amashuri.com" || h.ends_with(".amashuri.com"))
        }
        Env::Development => matches!(url.host_str(), Some("localhost" | "127.0.0.1")),
    }
}

pub fn main_frame_allowed(env: Env, apps: &[AppDef], url: &Url) -> bool {
    match url.scheme() {
        "about" | "blob" => true,
        "http" | "https" => trusted(env, apps, url),
        _ => false,
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum NewWindow {
    /// Switch to this app's tab and load the URL there (keeps an SSO `?code=`).
    App(&'static str, Url),
    /// A real popup window that shares the session (blob: PDFs, about:blank
    /// that a script fills, an NGA file link). Its own navigations are routed again.
    Popup,
    /// Default browser (or the OS for mailto:/tel:).
    External(Url),
    Block,
}

pub fn new_window(env: Env, apps: &[AppDef], url: &Url) -> NewWindow {
    match url.scheme() {
        "about" | "blob" => NewWindow::Popup,
        "http" | "https" => {
            if let Some(app) = apps.iter().find(|a| a.owns(url)) {
                NewWindow::App(app.key, url.clone())
            } else if trusted(env, apps, url) {
                NewWindow::Popup
            } else {
                NewWindow::External(url.clone())
            }
        }
        "mailto" | "tel" | "sms" => NewWindow::External(url.clone()),
        _ => NewWindow::Block,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::apps_for;

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn frames_only_filter_schemes() {
        assert_eq!(
            frame_navigation(&u("https://www.youtube.com/embed/x")),
            Frame::Allow
        );
        assert_eq!(
            frame_navigation(&u("https://mis.amashuri.com/home")),
            Frame::Allow
        );
        assert_eq!(frame_navigation(&u("about:blank")), Frame::Allow);
        assert!(matches!(
            frame_navigation(&u("mailto:a@b.rw")),
            Frame::OpenWithOs(_)
        ));
        assert_eq!(frame_navigation(&u("file:///etc/passwd")), Frame::Block);
        assert_eq!(frame_navigation(&u("javascript:alert(1)")), Frame::Block);
    }

    #[test]
    fn main_frame_allow_list() {
        let env = Env::Production;
        let apps = apps_for(env);
        for ok in [
            "https://mis.amashuri.com/login?client_id=tupo",
            "https://tupo.amashuri.com/sso/callback?code=x",
            "https://api.amashuri.com/files/1.pdf",
            "about:blank",
        ] {
            assert!(main_frame_allowed(env, &apps, &u(ok)), "{ok}");
        }
        for no in [
            "http://mis.amashuri.com/",
            "https://accounts.google.com/o/oauth2",
            "https://evil-amashuri.com/",
            "https://amashuri.com.evil.io/",
            "http://localhost:5173/",
            "file:///tmp/x",
        ] {
            assert!(!main_frame_allowed(env, &apps, &u(no)), "{no}");
        }
    }

    #[test]
    fn dev_allows_localhost_only() {
        let apps = apps_for(Env::Development);
        assert!(main_frame_allowed(
            Env::Development,
            &apps,
            &u("http://localhost:5194/app")
        ));
        assert!(!main_frame_allowed(
            Env::Development,
            &apps,
            &u("https://example.com/")
        ));
    }

    #[test]
    fn new_windows_route_to_tabs_popups_or_browser() {
        let env = Env::Production;
        let apps = apps_for(env);
        assert_eq!(
            new_window(
                env,
                &apps,
                &u("https://taskmentor.amashuri.com/sso/callback?code=abc")
            ),
            NewWindow::App(
                "taskmentor",
                u("https://taskmentor.amashuri.com/sso/callback?code=abc")
            )
        );
        assert_eq!(
            new_window(env, &apps, &u("https://api.amashuri.com/report.pdf")),
            NewWindow::Popup
        );
        assert_eq!(new_window(env, &apps, &u("about:blank")), NewWindow::Popup);
        assert_eq!(
            new_window(env, &apps, &u("blob:https://mis.amashuri.com/123")),
            NewWindow::Popup
        );
        assert!(matches!(
            new_window(env, &apps, &u("https://www.youtube.com/watch?v=1")),
            NewWindow::External(_)
        ));
        assert!(matches!(
            new_window(env, &apps, &u("https://accounts.google.com/x")),
            NewWindow::External(_)
        ));
        assert!(matches!(
            new_window(env, &apps, &u("mailto:x@y.rw")),
            NewWindow::External(_)
        ));
        assert_eq!(new_window(env, &apps, &u("file:///x")), NewWindow::Block);
    }
}
