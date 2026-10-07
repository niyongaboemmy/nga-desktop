//! Who is signed in to NGA MIS, as far as the tools need to know.
//!
//! The MIS page reports it (bridge.js, MIS webview only) from MIS's own cached
//! profile: id, persona (user type), first name and an age band. Never the
//! token. The shell uses it to keep each person's tool data in their own file
//! and to show the tools meant for them. Sign-out clears it.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime, Webview};
use tauri_plugin_store::StoreExt;

const STORE_KEY: &str = "toolsIdentity";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub user_id: u64,
    /// student | teacher | staff | admin | parent
    pub persona: String,
    pub first_name: String,
    /// "under13" | "13to17" | "adult", or None when MIS has no date of birth.
    pub age_band: Option<String>,
}

#[derive(Default)]
pub struct Current(pub Mutex<Option<Identity>>);

/// MIS `user_type` → the tools' persona. Unknown types count as staff (the
/// most restricted adult view), never as a student or an admin.
pub fn persona(user_type: &str) -> &'static str {
    match user_type.trim().to_ascii_uppercase().as_str() {
        "STUDENT" => "student",
        "TEACHER" => "teacher",
        "ADMIN" => "admin",
        "PARENT" => "parent",
        _ => "staff",
    }
}

/// Age band from a `YYYY-MM-DD…` date of birth on `today` (YYYY, MM, DD).
pub fn age_band(dob: &str, today: (i32, u32, u32)) -> Option<&'static str> {
    let d = dob.get(0..10)?;
    let mut parts = d.split('-');
    let y: i32 = parts.next()?.parse().ok()?;
    let m: u32 = parts.next()?.parse().ok()?;
    let day: u32 = parts.next()?.parse().ok()?;
    if !(1900..=2100).contains(&y) || !(1..=12).contains(&m) || !(1..=31).contains(&day) {
        return None;
    }
    let mut age = today.0 - y;
    if (today.1, today.2) < (m, day) {
        age -= 1;
    }
    if age < 0 {
        return None;
    }
    Some(if age < 13 {
        "under13"
    } else if age < 18 {
        "13to17"
    } else {
        "adult"
    })
}

fn today() -> (i32, u32, u32) {
    // Civil date from the Unix day count (Howard Hinnant's algorithm), UTC.
    let days = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        / 86_400) as i64;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = (yoe + era * 400 + if m <= 2 { 1 } else { 0 }) as i32;
    (y, m, d)
}

fn clip(s: &str, max: usize) -> String {
    s.trim().chars().take(max).collect()
}

pub fn get<R: Runtime>(app: &AppHandle<R>) -> Option<Identity> {
    let state = app.state::<Current>();
    let mut cur = state.0.lock().unwrap();
    if cur.is_none() {
        // After a restart, until MIS reports again (or while offline).
        *cur = app
            .store("settings.json")
            .ok()
            .and_then(|s| s.get(STORE_KEY))
            .and_then(|v| serde_json::from_value(v).ok());
    }
    cur.clone()
}

fn set<R: Runtime>(app: &AppHandle<R>, next: Option<Identity>) {
    {
        let state = app.state::<Current>();
        let mut cur = state.0.lock().unwrap();
        if *cur == next {
            return;
        }
        let prev = cur.as_ref().map(|i| i.user_id);
        *cur = next.clone();
        drop(cur);
        // Someone signed out (or another person signed in): on a shared
        // computer, their tool data may have to go (vault.rs).
        if let Some(prev) = prev.filter(|p| next.as_ref().map(|n| n.user_id) != Some(*p)) {
            super::vault::on_sign_out(app, prev);
        }
    }
    if let Ok(store) = app.store("settings.json") {
        match &next {
            Some(id) => store.set(STORE_KEY, serde_json::to_value(id).unwrap_or_default()),
            None => {
                store.delete(STORE_KEY);
            }
        }
    }
    log::info!(
        "tools identity: {}",
        next.as_ref()
            .map(|i| format!("signed in ({})", i.persona))
            .unwrap_or_else(|| "none".into())
    );
    super::emit_shell(app, "nga://identity", next);
}

/// MIS signed out (or "Sign out of this computer"): forget who it was.
pub fn clear<R: Runtime>(app: &AppHandle<R>) {
    set(app, None);
}

/// From the MIS page only (bridge.js). Any other page is refused.
#[tauri::command]
pub fn web_identity<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    user_id: u64,
    user_type: String,
    first_name: Option<String>,
    date_of_birth: Option<String>,
) -> Result<(), String> {
    let shell = app.state::<crate::webviews::Shell>();
    let mis = crate::registry::identity_provider(&shell.apps).key;
    if webview.label() != crate::webviews::label(mis) {
        return Err("only NGA MIS reports who is signed in".into());
    }
    if user_id == 0 {
        return Err("bad user".into());
    }
    let id = Identity {
        user_id,
        persona: persona(&user_type).to_string(),
        first_name: clip(first_name.as_deref().unwrap_or(""), 40),
        age_band: date_of_birth
            .as_deref()
            .and_then(|d| age_band(d, today()))
            .map(str::to_string),
    };
    crate::autostart::apply_default(&app, &id.persona);
    set(&app, Some(id));
    Ok(())
}

#[tauri::command]
pub fn tools_identity<R: Runtime>(app: AppHandle<R>) -> Option<Identity> {
    get(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn personas_never_upgrade_unknown_types() {
        assert_eq!(persona("STUDENT"), "student");
        assert_eq!(persona("student "), "student");
        assert_eq!(persona("TEACHER"), "teacher");
        assert_eq!(persona("ADMIN"), "admin");
        assert_eq!(persona("PARENT"), "parent");
        assert_eq!(persona("STAFF"), "staff");
        assert_eq!(persona(""), "staff");
        assert_eq!(persona("SUPERUSER"), "staff");
    }

    #[test]
    fn age_bands_turn_on_the_birthday() {
        let today = (2026, 10, 5);
        assert_eq!(age_band("2013-10-05", today), Some("13to17"));
        assert_eq!(age_band("2013-10-06", today), Some("under13"));
        assert_eq!(age_band("2008-10-05T00:00:00.000Z", today), Some("adult"));
        assert_eq!(age_band("2008-10-06", today), Some("13to17"));
        assert_eq!(age_band("1980-01-01", today), Some("adult"));
    }

    #[test]
    fn bad_dates_give_no_band() {
        let today = (2026, 10, 5);
        assert_eq!(age_band("", today), None);
        assert_eq!(age_band("not-a-date", today), None);
        assert_eq!(age_band("2030-01-01", today), None);
        assert_eq!(age_band("2010-13-01", today), None);
    }

    #[test]
    fn today_is_a_plausible_date() {
        let (y, m, d) = today();
        assert!(y >= 2025 && (1..=12).contains(&m) && (1..=31).contains(&d));
    }
}
