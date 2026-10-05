//! NGA Tools → NGA MIS API, through the MIS page itself.
//!
//! The shell never holds the MIS token. A tool asks here (`tools_api`); Rust passes
//! the request into the MIS webview (bridge.js `__ngaToolsApi`), which calls MIS's
//! API from MIS's own origin with its own session, and streams the answer back
//! (`web_tools_api_event`) as `nga://tools-api` events to the shell's windows.
//! Only `/desktop/tools/…` paths are allowed, in Rust and again in the bridge.

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, Webview};

const MAX_BODY: usize = 200_000;

pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 40 && id.bytes().all(|b| b.is_ascii_alphanumeric())
}

/// A query string: short, and only `a-z A-Z 0-9 = & _ -` (no encoding tricks).
pub fn valid_query(q: &str) -> bool {
    q.len() <= 100
        && q.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"=&_-".contains(&b))
}

pub fn valid_path(path: &str) -> bool {
    path.len() <= 120
        && path.starts_with("/desktop/tools/")
        && !path.contains("..")
        && path
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"/-_".contains(&b))
}

fn mis_webview<R: Runtime>(app: &AppHandle<R>) -> Option<Webview<R>> {
    let shell = app.state::<crate::webviews::Shell>();
    let key = crate::registry::identity_provider(&shell.apps).key;
    app.get_webview(&crate::webviews::label(key))
}

/// The JavaScript that starts a request inside the MIS page (all values JSON-escaped).
pub fn request_script(
    id: &str,
    method: &str,
    path: &str,
    body: Option<&str>,
    query: Option<&str>,
) -> String {
    let j = |s: &str| serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into());
    format!(
        "window.__ngaToolsApi && window.__ngaToolsApi({}, {}, {}, {}, {})",
        j(id),
        j(method),
        j(path),
        body.map(j).unwrap_or_else(|| "null".into()),
        query.map(j).unwrap_or_else(|| "null".into())
    )
}

#[tauri::command]
pub fn tools_api<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    method: String,
    path: String,
    body: Option<String>,
    query: Option<String>,
) -> Result<(), String> {
    if !valid_id(&id)
        || !valid_path(&path)
        || !(method == "GET" || method == "POST")
        || query.as_deref().is_some_and(|q| !valid_query(q))
    {
        return Err("bad request".into());
    }
    if body.as_ref().is_some_and(|b| b.len() > MAX_BODY) {
        return Err("Too long".into());
    }
    if crate::auth::mis_signed_in() == Some(false) {
        return Err("Sign in to NGA MIS first".into());
    }
    let wv = mis_webview(&app).ok_or("NGA MIS isn't open yet")?;
    wv.eval(request_script(
        &id,
        &method,
        &path,
        body.as_deref(),
        query.as_deref(),
    ))
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tools_api_cancel<R: Runtime>(app: AppHandle<R>, id: String) {
    if valid_id(&id) {
        if let Some(wv) = mis_webview(&app) {
            let _ = wv.eval(format!(
                "window.__ngaToolsApiCancel && window.__ngaToolsApiCancel({})",
                serde_json::to_string(&id).unwrap_or_default()
            ));
        }
    }
}

#[derive(Serialize, Clone)]
struct ApiEvent {
    id: String,
    kind: String,
    data: Option<String>,
}

/// From the MIS page only: progress of a request started by `tools_api`.
#[tauri::command]
pub fn web_tools_api_event<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    id: String,
    kind: String,
    data: Option<String>,
) -> Result<(), String> {
    let mis = mis_webview(&app).ok_or("no MIS")?;
    if webview.label() != mis.label() {
        return Err("only NGA MIS answers tool requests".into());
    }
    if !valid_id(&id) || !matches!(kind.as_str(), "lines" | "end" | "response" | "error") {
        return Err("bad event".into());
    }
    super::emit_shell(&app, "nga://tools-api", ApiEvent { id, kind, data });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_tools_paths_go_through() {
        assert!(valid_path("/desktop/tools/ai/chat"));
        assert!(valid_path("/desktop/tools/ai/status"));
        assert!(!valid_path("/users/me"));
        assert!(!valid_path("/desktop/tools/../marks"));
        assert!(!valid_path("/desktop/tools/ai?x=1"));
        assert!(!valid_path("/desktop/tools/AI"));
        assert!(!valid_path("https://evil.example/desktop/tools/x"));
    }

    #[test]
    fn ids_are_plain() {
        assert!(valid_id("abc123"));
        assert!(!valid_id(""));
        assert!(!valid_id("a'b"));
        assert!(!valid_id(&"a".repeat(41)));
    }

    #[test]
    fn scripts_escape_everything() {
        let s = request_script(
            "a1",
            "POST",
            "/desktop/tools/ai/chat",
            Some("{\"m\":\"</script>'\\\"\"}"),
            None,
        );
        assert!(s.starts_with("window.__ngaToolsApi && window.__ngaToolsApi(\"a1\", \"POST\", \"/desktop/tools/ai/chat\", \""));
        assert!(
            !s.contains("'\"\"}\")"),
            "quotes inside the body are escaped"
        );
        assert_eq!(request_script("a", "GET", "/desktop/tools/x", None, Some("days=7")), "window.__ngaToolsApi && window.__ngaToolsApi(\"a\", \"GET\", \"/desktop/tools/x\", null, \"days=7\")");
    }

    #[test]
    fn queries_are_plain() {
        assert!(valid_query("days=7"));
        assert!(valid_query("a=1&b=two_3"));
        assert!(!valid_query("x=%2e%2e"));
        assert!(!valid_query("x=1#y"));
        assert!(!valid_query("x=1/../y"));
        assert!(!valid_query(&"a".repeat(101)));
    }
}
