//! The school (tenant) this computer is signed in to, and switching it.
//!
//! TENANT_SWITCHING_PLAN.md §4.4 / §4.6: the selected school is the `tid` of
//! the MIS session, and switching happens only in MIS. NGA Desktop:
//!
//! - shows a **school chip** in the title bar (name + logo) when the person has
//!   two or more schools. The MIS page reports it (bridge.js `web_school`, from
//!   MIS `GET /auth/my-schools`, or the public `GET /tenant/branding` on an MIS
//!   without it). Clicking it opens `<MIS>/switch-school?return=<MIS page>` in
//!   the MIS tab;
//! - after a **school switch** (tools/identity.rs: same e-mail, new tid, still
//!   signed in, right after a switch signal), closes the other apps and forgets
//!   their SSO handshakes before the inbox swaps (`begin_switch`), then
//!   re-opens the ones that were open, so their SSO lands in the new school
//!   (`finish_switch`). Nothing is wiped.

use crate::auth::{self, Page};
use crate::registry::{self, AppDef};
use crate::tenancy::Account;
use crate::webviews::{self, Shell};
use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime, Url, Webview};

/// What the title-bar chip shows.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct School {
    pub tid: u64,
    pub name: String,
    /// A `data:image/…` URL (fetched by the MIS page), or None.
    pub logo: Option<String>,
    /// How many schools the person can switch between (1 when unknown).
    pub schools: u32,
}

#[derive(Default)]
pub struct Current(pub Mutex<Option<School>>);

/// When the person last asked for the switch page from the chip.
static INTENT: Mutex<Option<Instant>> = Mutex::new(None);
const INTENT_FOR: Duration = Duration::from_secs(10 * 60);

/// Logos are small; anything bigger is not shown (the chip keeps the name).
const MAX_LOGO: usize = 300_000;
const LOGO_TYPES: &[&str] = &[
    "data:image/png;base64,",
    "data:image/jpeg;base64,",
    "data:image/gif;base64,",
    "data:image/webp;base64,",
    "data:image/svg+xml;base64,",
];

pub fn valid_logo(logo: &str) -> bool {
    logo.len() <= MAX_LOGO
        && LOGO_TYPES.iter().any(|p| logo.starts_with(p))
        && logo.split_once(',').is_some_and(|(_, b)| {
            b.bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"+/=".contains(&c))
        })
}

pub fn clean_name(name: &str) -> String {
    name.chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .trim()
        .chars()
        .take(80)
        .collect()
}

/// `<MIS>/switch-school?return=<where to come back>`: the MIS page on screen
/// when it is one of MIS's signed-in pages, else MIS home.
pub fn switch_url(mis: &AppDef, current: Option<&Url>) -> Option<Url> {
    let back = current
        .filter(|u| {
            auth::classify(mis, u) == Page::SignedIn && !u.path().starts_with("/switch-school")
        })
        .cloned()
        .unwrap_or_else(|| mis.start_url());
    let mut url = Url::parse(&format!("{}{}/switch-school", mis.origin, mis.base)).ok()?;
    url.query_pairs_mut().append_pair("return", back.as_str());
    Some(url)
}

/// Which spokes to re-open after a switch, and which one gets the screen
/// (the one that was on screen, so the person stays where they were).
pub fn reopen_plan(open: &[&'static str], active: Option<&str>) -> Vec<(&'static str, bool)> {
    let mut plan: Vec<(&'static str, bool)> =
        open.iter().map(|k| (*k, active == Some(*k))).collect();
    plan.sort_by_key(|(_, focus)| !*focus);
    plan
}

fn emit<R: Runtime>(app: &AppHandle<R>, school: Option<School>) {
    let _ = app.emit_to(webviews::SHELL, "nga://school", school);
}

/// The signed-in account changed: the chip's school is no longer known (the
/// MIS page reports the new one within seconds).
pub fn identity_changed<R: Runtime>(app: &AppHandle<R>, next: Option<Account>) {
    let cleared = {
        let state = app.state::<Current>();
        let mut cur = state.0.lock().unwrap();
        let stale = cur
            .as_ref()
            .is_some_and(|s| Some(s.tid) != next.map(|a| a.tid));
        if stale {
            *cur = None;
        }
        stale
    };
    if cleared {
        emit(app, None);
    }
}

/// What to re-open after a school switch (see `reopen_plan`).
pub type ReopenPlan = Vec<(&'static str, bool)>;

/// A school switch, first half (called BEFORE the inbox swaps to the new
/// school, DK-ISO-4): note which spokes are open, then close them and forget
/// their SSO handshakes (the old school's, and any earlier one of the new
/// school: their pages may hold another school's token). Nothing the old
/// school's pages raise can reach the new school's inbox after this.
pub fn begin_switch<R: Runtime>(app: &AppHandle<R>) -> ReopenPlan {
    let shell = app.state::<Shell>();
    let open: Vec<&'static str> = shell
        .apps
        .iter()
        .filter(|a| a.sso.is_some() && app.get_webview(&webviews::label(a.key)).is_some())
        .map(|a| a.key)
        .collect();
    let plan = reopen_plan(&open, shell.active().as_deref());
    webviews::close_spokes(app);
    webviews::forget_sso(app);
    auth::forget_spokes();
    // A notice raised by the old school's pages must not open them again.
    crate::tools::windows::close_all(app);
    plan
}

/// A school switch, second half: re-open the apps that were open. Their first
/// load is MIS's SSO hop, which follows MIS into the new school.
pub fn finish_switch<R: Runtime>(app: &AppHandle<R>, plan: ReopenPlan) {
    let intended = INTENT
        .lock()
        .unwrap()
        .take()
        .is_some_and(|t| t.elapsed() < INTENT_FOR);
    log::info!(
        "school switch ({})",
        if intended {
            "from the title bar"
        } else {
            "made in MIS"
        }
    );
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = handle.emit_to(
            webviews::SHELL,
            "nga://toast",
            crate::i18n::t("toast.schoolSwitched").to_string(),
        );
        tokio::time::sleep(Duration::from_millis(600)).await;
        for (key, focus) in plan {
            let h = handle.clone();
            let _ = handle.run_on_main_thread(move || {
                let r = if focus {
                    webviews::open_app(&h, key, None)
                } else {
                    webviews::ensure_app(&h, key)
                };
                if let Err(e) = r {
                    log::warn!("[{key}] could not sign in again after the switch: {e}");
                }
            });
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });
}

/// From the MIS page only (bridge.js): the current school, for the chip.
#[tauri::command]
pub fn web_school<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    tid: u64,
    name: String,
    logo: Option<String>,
    schools: u32,
) -> Result<(), String> {
    let shell = app.state::<Shell>();
    let mis = registry::identity_provider(&shell.apps).key;
    if webview.label() != webviews::label(mis) {
        return Err("only NGA MIS reports the school".into());
    }
    // Only for the school the signed-in identity belongs to (never ahead of it).
    if crate::tools::identity::account(&app).map(|a| a.tid) != Some(tid) {
        return Err("not the signed-in school".into());
    }
    let name = clean_name(&name);
    if name.is_empty() {
        return Err("no name".into());
    }
    let next = School {
        tid,
        name,
        logo: logo.filter(|l| valid_logo(l)),
        schools: schools.clamp(1, 999),
    };
    let changed = {
        let state = app.state::<Current>();
        let mut cur = state.0.lock().unwrap();
        let changed = cur.as_ref() != Some(&next);
        *cur = Some(next.clone());
        changed
    };
    if changed {
        emit(&app, Some(next));
    }
    Ok(())
}

#[tauri::command]
pub fn school_info<R: Runtime>(app: AppHandle<R>) -> Option<School> {
    app.state::<Current>().0.lock().unwrap().clone()
}

/// The title-bar chip: MIS's switch page, in the MIS tab.
#[tauri::command]
pub fn school_switch_open<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let shell = app.state::<Shell>();
    let mis = registry::identity_provider(&shell.apps).clone();
    let current = app
        .get_webview(&webviews::label(mis.key))
        .and_then(|wv| webviews::page_url(&wv));
    let url = switch_url(&mis, current.as_ref()).ok_or("bad MIS address")?;
    *INTENT.lock().unwrap() = Some(Instant::now());
    crate::tools::identity::note_switch_signal();
    log::info!("opening MIS's switch-school page");
    webviews::open_app(&app, mis.key, Some(url)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::{apps_for, find, Env};

    #[test]
    fn switch_page_returns_to_the_mis_page_on_screen() {
        let apps = apps_for(Env::Production);
        let mis = find(&apps, "mis").unwrap();
        let here = Url::parse("https://mis.amashuri.com/timetable?week=3").unwrap();
        let url = switch_url(mis, Some(&here)).unwrap();
        assert_eq!(
            url.origin().ascii_serialization(),
            "https://mis.amashuri.com"
        );
        assert_eq!(url.path(), "/switch-school");
        let back: Vec<_> = url.query_pairs().collect();
        assert_eq!(back.len(), 1);
        assert_eq!(back[0].0, "return");
        assert_eq!(back[0].1, "https://mis.amashuri.com/timetable?week=3");
    }

    #[test]
    fn switch_page_falls_back_to_mis_home() {
        let apps = apps_for(Env::Production);
        let mis = find(&apps, "mis").unwrap();
        let home = "https://mis.amashuri.com/home";
        for page in [
            None,
            Some("https://mis.amashuri.com/login"),
            Some("https://mis.amashuri.com/login?client_id=tupo"),
            Some("https://mis.amashuri.com/switch-school?return=x"),
            Some("https://tupo.amashuri.com/app"),
        ] {
            let u = page.map(|p| Url::parse(p).unwrap());
            let url = switch_url(mis, u.as_ref()).unwrap();
            let back = url.query_pairs().find(|(k, _)| k == "return").unwrap().1;
            assert_eq!(back, home, "{page:?}");
        }
    }

    #[test]
    fn the_app_on_screen_reopens_first_and_keeps_the_screen() {
        assert_eq!(
            reopen_plan(&["taskmentor", "tendo", "tupo"], Some("tupo")),
            vec![("tupo", true), ("taskmentor", false), ("tendo", false)]
        );
        assert_eq!(
            reopen_plan(&["taskmentor", "tendo"], Some("mis")),
            vec![("taskmentor", false), ("tendo", false)]
        );
        assert!(reopen_plan(&[], Some("tupo")).is_empty());
    }

    #[test]
    fn logos_must_be_small_image_data_urls() {
        assert!(valid_logo("data:image/png;base64,iVBORw0KGgo="));
        assert!(valid_logo("data:image/svg+xml;base64,PHN2Zz4="));
        assert!(!valid_logo(
            "https://api.amashuri.com/schools/1/logo/primary"
        ));
        assert!(!valid_logo("data:text/html;base64,PGgxPg=="));
        assert!(!valid_logo("data:image/png;base64,abc\"onerror=x"));
        let big = format!("data:image/png;base64,{}", "A".repeat(MAX_LOGO));
        assert!(!valid_logo(&big));
    }

    #[test]
    fn names_are_trimmed_and_capped() {
        assert_eq!(
            clean_name("  New Generation Academy \n"),
            "New Generation Academy"
        );
        assert_eq!(clean_name(&"x".repeat(200)).len(), 80);
        assert_eq!(clean_name("\u{0007}"), "");
    }
}
