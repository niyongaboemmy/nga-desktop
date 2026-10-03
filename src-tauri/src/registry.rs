//! The NGA apps this shell hosts, and the origins it will ever load.
//!
//! Keys and production origins mirror `NGA_APPS` in
//! `nga_central_mis/frontend/src/components/apps/ngaApps.ts`; keep them in sync.
//! The SSO client ids are the public ones each spoke already sends to MIS
//! (`VITE_SSO_CLIENT_ID`); they are not secrets.
//!
//! The environment is fixed at compile time (`NGA_ENV=production|development`),
//! so a production binary contains production origins only.

use serde::Serialize;
use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Env {
    Production,
    Development,
}

pub fn current_env() -> Env {
    match option_env!("NGA_ENV") {
        Some("development") => Env::Development,
        _ => Env::Production,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sso {
    /// The spoke's public OAuth client id at MIS.
    pub client_id: &'static str,
    /// Path of the spoke's registered callback (`allowed_redirect_uris`).
    pub callback_path: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDef {
    pub key: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    /// Scheme + host (+ port), no trailing slash.
    pub origin: String,
    /// Path prefix the app is served under (`/taskmentor` in Task Mentor dev), else empty.
    pub base: &'static str,
    pub start_path: &'static str,
    pub color: &'static str,
    /// `None` for MIS itself (the identity provider).
    pub sso: Option<Sso>,
}

impl AppDef {
    pub fn start_url(&self) -> Url {
        Url::parse(&format!("{}{}{}", self.origin, self.base, self.start_path))
            .expect("valid start url")
    }

    pub fn callback_url(&self) -> Option<Url> {
        let sso = self.sso.as_ref()?;
        Url::parse(&format!(
            "{}{}{}",
            self.origin, self.base, sso.callback_path
        ))
        .ok()
    }

    pub fn owns(&self, url: &Url) -> bool {
        origin_of(url).as_deref() == Some(self.origin.as_str())
    }
}

/// `scheme://host[:port]` of a URL, the same way `ngaApps.ts` writes origins.
pub fn origin_of(url: &Url) -> Option<String> {
    let host = url.host_str()?;
    Some(match url.port() {
        Some(port) => format!("{}://{}:{}", url.scheme(), host, port),
        None => format!("{}://{}", url.scheme(), host),
    })
}

pub fn apps_for(env: Env) -> Vec<AppDef> {
    let (mis, tm, tendo, tupo, tm_base) = match env {
        Env::Production => (
            "https://mis.amashuri.com",
            "https://taskmentor.amashuri.com",
            "https://tendo.amashuri.com",
            "https://tupo.amashuri.com",
            "",
        ),
        Env::Development => (
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:3000",
            "http://localhost:5194",
            "/taskmentor",
        ),
    };
    vec![
        AppDef {
            key: "mis",
            name: "NGA MIS",
            description: "Timetable, lessons, reminders, reports",
            origin: mis.into(),
            base: "",
            start_path: "/home",
            color: "#2f56d9",
            sso: None,
        },
        AppDef {
            key: "taskmentor",
            name: "Task Mentor",
            description: "Quizzes, assignments, marks and report cards",
            origin: tm.into(),
            base: tm_base,
            start_path: "/dashboard",
            color: "#3b82f6",
            sso: Some(Sso {
                client_id: "taskmentor_app",
                callback_path: "/sso/callback",
            }),
        },
        AppDef {
            key: "tendo",
            name: "Tendo",
            description: "Attendance and discipline",
            origin: tendo.into(),
            base: "",
            start_path: "/",
            color: "#1e6fd9",
            sso: Some(Sso {
                client_id: "discipline_attendance",
                callback_path: "/sso/callback",
            }),
        },
        AppDef {
            key: "tupo",
            name: "Tupo",
            description: "Chat, meetings, mail and the school feed",
            origin: tupo.into(),
            base: "",
            start_path: "/app",
            color: "#005EF9",
            sso: Some(Sso {
                client_id: "tupo",
                callback_path: "/sso/callback",
            }),
        },
    ]
}

pub fn find<'a>(apps: &'a [AppDef], key: &str) -> Option<&'a AppDef> {
    apps.iter().find(|a| a.key == key)
}

pub fn identity_provider(apps: &[AppDef]) -> &AppDef {
    apps.iter()
        .find(|a| a.sso.is_none())
        .expect("MIS is in the registry")
}

/// MIS API base (for the shell's "Sign out", which runs inside the MIS webview).
pub fn mis_api_base() -> &'static str {
    match current_env() {
        Env::Production => "https://api.amashuri.com",
        Env::Development => "http://localhost:5001",
    }
}

/// The URL that signs a spoke in through MIS's existing SSO login page.
/// Signed in at MIS already → MIS mints a code and redirects to the callback;
/// signed out → MIS shows its login form first. No MIS change needed.
pub fn sso_entry_url(apps: &[AppDef], app: &AppDef) -> Option<Url> {
    let sso = app.sso.as_ref()?;
    let callback = app.callback_url()?;
    let mut url = Url::parse(&format!("{}/login", identity_provider(apps).origin)).ok()?;
    url.query_pairs_mut()
        .append_pair("client_id", sso.client_id)
        .append_pair("redirect_uri", callback.as_str())
        .append_pair("response_type", "code");
    Some(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_has_only_https_amashuri_origins() {
        for app in apps_for(Env::Production) {
            assert!(
                app.origin.starts_with("https://") && app.origin.ends_with(".amashuri.com"),
                "{}",
                app.origin
            );
        }
    }

    #[test]
    fn sso_entry_points_at_mis_login_with_the_spoke_callback() {
        let apps = apps_for(Env::Production);
        let tm = find(&apps, "taskmentor").unwrap();
        let url = sso_entry_url(&apps, tm).unwrap();
        assert_eq!(
            url.origin().ascii_serialization(),
            "https://mis.amashuri.com"
        );
        assert_eq!(url.path(), "/login");
        let q: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(q["client_id"], "taskmentor_app");
        assert_eq!(
            q["redirect_uri"],
            "https://taskmentor.amashuri.com/sso/callback"
        );
        assert!(sso_entry_url(&apps, find(&apps, "mis").unwrap()).is_none());
    }

    #[test]
    fn dev_task_mentor_keeps_its_base_path() {
        let apps = apps_for(Env::Development);
        let tm = find(&apps, "taskmentor").unwrap();
        assert_eq!(
            tm.start_url().as_str(),
            "http://localhost:5174/taskmentor/dashboard"
        );
        assert_eq!(
            tm.callback_url().unwrap().as_str(),
            "http://localhost:5174/taskmentor/sso/callback"
        );
    }
}
