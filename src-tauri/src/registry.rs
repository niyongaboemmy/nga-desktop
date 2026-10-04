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

/// WebView2 arguments for every webview (they must match across webviews that
/// share a profile). Development builds add `NGA_TEST_BROWSER_ARGS`, e.g. a
/// fake camera for the CI probe (scripts/probe-ci.mjs); release builds never.
pub fn browser_args() -> String {
    // Tauri's defaults, which a custom value replaces.
    let mut args = String::from("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection");
    if current_env() == Env::Development {
        if let Ok(extra) = std::env::var("NGA_TEST_BROWSER_ARGS") {
            args.push(' ');
            args.push_str(&extra);
        }
    }
    args
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
    /// Paths (relative to `base`) where the app shows its signed-out page.
    #[serde(skip)]
    pub signed_out_paths: &'static [&'static str],
    /// Paths that are public and say nothing about the session (prefix match).
    #[serde(skip)]
    pub neutral_paths: &'static [&'static str],
    /// Pages where the person must not be disturbed (a meeting, a quiz). `:id`
    /// matches one path segment that isn't a word like "new" or "history".
    #[serde(skip)]
    pub focus_paths: &'static [&'static str],
    /// Places worth jumping to from the command palette.
    pub destinations: &'static [Destination],
}

#[derive(Debug, Clone, Serialize)]
pub struct Destination {
    pub label: &'static str,
    pub path: &'static str,
    /// Extra words people may type for it.
    pub keywords: &'static str,
}

const fn d(label: &'static str, path: &'static str, keywords: &'static str) -> Destination {
    Destination {
        label,
        path,
        keywords,
    }
}

/// Does `path` match a focus pattern like "/quizzes/:id/take"?
pub fn path_matches(pattern: &str, path: &str) -> bool {
    const NOT_IDS: &[&str] = &["new", "history", "create", "public"];
    let p: Vec<&str> = pattern.trim_matches('/').split('/').collect();
    let q: Vec<&str> = path
        .trim_end_matches('/')
        .trim_start_matches('/')
        .split('/')
        .collect();
    p.len() == q.len()
        && p.iter().zip(&q).all(|(a, b)| {
            if *a == ":id" {
                !b.is_empty() && !NOT_IDS.contains(b)
            } else {
                a == b
            }
        })
}

impl AppDef {
    /// Is this URL (in this app) a meeting / quiz page?
    pub fn is_focus_page(&self, url: &Url) -> bool {
        if !self.owns(url) {
            return false;
        }
        let path = url.path().strip_prefix(self.base).unwrap_or(url.path());
        self.focus_paths.iter().any(|p| path_matches(p, path))
    }
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

const MIS_DESTINATIONS: &[Destination] = &[
    d("Home", "/home", "start welcome"),
    d("Timetable & calendar", "/calendar", "schedule lessons week"),
    d("Lesson notes", "/lesson-notes", "notes teaching"),
    d("Reminders", "/reminders", "alerts telegram"),
    d("My learning", "/my-learning", "courses e-learning student"),
    d("E-learning courses", "/elearning/courses", "studio builder"),
    d("Scheme of work", "/scheme-of-work", "sow plan"),
    d("Documents", "/documents", "files shared"),
    d("Office hours", "/office-hours", "mentor meeting"),
    d("Reporting", "/reporting", "reports"),
    d("Profile", "/profile", "account me"),
];

const TASK_MENTOR_DESTINATIONS: &[Destination] = &[
    d("Dashboard", "/dashboard", "home overview"),
    d("Courses", "/courses", "subjects classes"),
    d("Quizzes", "/quizzes", "tests exams"),
    d("My quizzes", "/my-quizzes", "student tests"),
    d("Assignments", "/assignments", "homework tasks"),
    d("Submissions", "/submissions", "marking grading"),
    d("Grades", "/grades", "marks report card"),
    d("Question bank", "/question-bank", "questions ai"),
    d("Ranking", "/ranking", "leaderboard"),
    d("Live proctoring", "/proctoring/live", "monitor exam"),
];

const TENDO_DESTINATIONS: &[Destination] = &[
    d("Today", "/attendance?view=day", "register now"),
    d(
        "Take attendance",
        "/attendance/mark",
        "register mark roll call",
    ),
    d("This week", "/attendance?view=week", "schedule"),
    d("Attendance records", "/attendance/records", "history"),
    d("Attendance report", "/attendance/report", "statistics"),
    d("Excuses", "/excuses", "absence permission"),
    d("Log discipline", "/discipline/log", "behaviour incident"),
    d("Discipline records", "/discipline/records", "behaviour"),
    d("Dashboard", "/dashboard", "overview"),
    d("Reports", "/reports", "analytics"),
];

const TUPO_DESTINATIONS: &[Destination] = &[
    d("Chat", "/app/chat", "messages dm channels"),
    d("Feed", "/app/feed", "posts news school"),
    d("Mail", "/app/mail", "email inbox"),
    d("Meetings", "/app/meet", "video call"),
    d("New meeting", "/app/meet/new", "start call video"),
    d("Files", "/app/files", "attachments documents"),
    d("Reels", "/app/feed/reels", "videos"),
];

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
            signed_out_paths: &["/login"],
            neutral_paths: &[
                "/about",
                "/contact",
                "/apps",
                "/verify/",
                "/download",
                "/desktop/",
            ],
            focus_paths: &[],
            destinations: MIS_DESTINATIONS,
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
            signed_out_paths: &["/login"],
            neutral_paths: &["/sso/"],
            focus_paths: &["/quizzes/:id/take", "/quiz/:id"],
            destinations: TASK_MENTOR_DESTINATIONS,
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
            signed_out_paths: &["/"],
            neutral_paths: &["/sso/", "/callback"],
            focus_paths: &[],
            destinations: TENDO_DESTINATIONS,
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
            signed_out_paths: &["/"],
            neutral_paths: &["/sso/", "/meet/"],
            focus_paths: &["/app/meet/:id", "/meet/:id"],
            destinations: TUPO_DESTINATIONS,
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
    fn focus_pages() {
        let apps = apps_for(Env::Production);
        let tupo = find(&apps, "tupo").unwrap();
        let tm = find(&apps, "taskmentor").unwrap();
        let u = |s: &str| Url::parse(s).unwrap();
        assert!(tupo.is_focus_page(&u("https://tupo.amashuri.com/app/meet/abc-123")));
        assert!(!tupo.is_focus_page(&u("https://tupo.amashuri.com/app/meet/new")));
        assert!(!tupo.is_focus_page(&u("https://tupo.amashuri.com/app/meet")));
        assert!(tm.is_focus_page(&u("https://taskmentor.amashuri.com/quizzes/42/take")));
        assert!(!tm.is_focus_page(&u("https://taskmentor.amashuri.com/quizzes/42")));
        assert!(!tm.is_focus_page(&u("https://tupo.amashuri.com/quizzes/42/take")));
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
