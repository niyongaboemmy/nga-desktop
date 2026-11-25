//! Who is signed in to NGA MIS, as far as the tools need to know.
//!
//! The MIS page reports it (bridge.js, MIS webview only) from MIS's own cached
//! profile: id, persona (user type), first name and an age band. Never the
//! token. The shell uses it to keep each person's tool data in their own file
//! and to show the tools meant for them. Sign-out clears it.
//!
//! The school (tenant id) comes with it, so a person is `<tid>:<userId>`
//! (tenancy.rs). When someone else takes over this computer, the shared
//! browsing profile is wiped before they carry on. The same person (same
//! e-mail) moving to another of their schools is a school switch instead:
//! nothing is wiped, and the other apps sign in again into the new school
//! (school.rs).

use crate::tenancy::{self, Account, Seen, Takeover};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime, Webview};
use tauri_plugin_store::StoreExt;

const STORE_KEY: &str = "toolsIdentity";
/// The last person seen signed in (kept across sign-out, cleared by a wipe), to
/// tell when someone else takes over this computer: a `tenancy::Seen` (account
/// + e-mail; older versions stored the account alone).
const LAST_ACCOUNT_KEY: &str = "lastAccount";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    /// The school. Missing (stored before multi-tenancy, or an older MIS) = tenant 1.
    #[serde(default = "tenancy::primary_tid")]
    pub tid: u64,
    pub user_id: u64,
    /// student | teacher | staff | admin | parent
    pub persona: String,
    pub first_name: String,
    /// "under13" | "13to17" | "adult", or None when MIS has no date of birth.
    pub age_band: Option<String>,
}

impl Identity {
    pub fn account(&self) -> Account {
        Account::new(Some(self.tid), self.user_id)
    }
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

/// The signed-in person's account, if known.
pub fn account<R: Runtime>(app: &AppHandle<R>) -> Option<Account> {
    get(app).map(|i| i.account())
}

fn last_seen<R: Runtime>(app: &AppHandle<R>) -> Option<Seen> {
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get(LAST_ACCOUNT_KEY))
        .and_then(|v| serde_json::from_value(v).ok())
        .or_else(|| {
            // First run after the upgrade: whoever was signed in before (tenant 1).
            app.store("settings.json")
                .ok()
                .and_then(|s| s.get(STORE_KEY))
                .and_then(|v| serde_json::from_value::<Identity>(v).ok())
                .map(|i| Seen::new(i.account(), None))
        })
}

fn remember_seen<R: Runtime>(app: &AppHandle<R>, seen: &Seen) {
    if let Ok(store) = app.store("settings.json") {
        store.set(
            LAST_ACCOUNT_KEY,
            serde_json::to_value(seen).unwrap_or_default(),
        );
    }
}

/// What a change of the signed-in account sets off on this computer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Effects {
    /// Wipe the shared browsing profile (`commands::reset_local_profile`).
    pub wipe_profile: bool,
    /// Close the other apps and sign them in again into the new school (school.rs).
    pub resign_spokes: bool,
    /// The previous account signed out: its tool data may have to go (vault.rs).
    pub vault_sign_out: bool,
}

pub fn effects(takeover: Takeover, account_changed: bool, had_previous: bool) -> Effects {
    Effects {
        wipe_profile: takeover == Takeover::OtherPerson,
        resign_spokes: takeover == Takeover::SchoolSwitch,
        // A school switch isn't a sign-out: the same person carries on.
        vault_sign_out: account_changed && had_previous && takeover != Takeover::SchoolSwitch,
    }
}

/// The browsing profile was wiped: nobody's data is left to protect.
pub fn forget_last_account<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(store) = app.store("settings.json") {
        store.delete(LAST_ACCOUNT_KEY);
    }
}

/// `email`: the signed-in account's e-mail as MIS reported it (links one
/// person's accounts across schools; None for a sign-out or an older MIS).
fn set<R: Runtime>(app: &AppHandle<R>, next: Option<Identity>, email: Option<&str>) {
    let next_account = next.as_ref().map(Identity::account);
    let next_seen = next_account.map(|a| Seen::new(a, email));
    let last = next_seen.as_ref().and_then(|_| last_seen(app));
    let prev_account = {
        let state = app.state::<Current>();
        let mut cur = state.0.lock().unwrap();
        if *cur == next {
            drop(cur);
            // Same person as before: just learn their e-mail (first report
            // after an upgrade), so a later school switch is recognised.
            if let Some(seen) = next_seen.filter(|s| s.email.is_some() && last.as_ref() != Some(s))
            {
                remember_seen(app, &seen);
            }
            return;
        }
        let prev = cur.as_ref().map(Identity::account);
        *cur = next.clone();
        prev
    };
    let takeover = tenancy::takeover(last.as_ref(), next_seen.as_ref());
    let todo = effects(
        takeover,
        prev_account != next_account,
        prev_account.is_some(),
    );
    if todo.vault_sign_out {
        // Someone signed out (or another person signed in): on a shared
        // computer, their tool data may have to go (vault.rs).
        if let Some(prev) = prev_account {
            super::vault::on_sign_out(app, prev);
        }
    }
    if prev_account != next_account {
        // Each person sees only their own inbox (notifications.rs): on a
        // school switch too (`<tid>:<userId>` changes with the school).
        crate::notifications::switch_account(app, next_account);
    }
    // The school chip shows the new school once MIS reports it.
    crate::school::identity_changed(app, next_account);
    if let Ok(store) = app.store("settings.json") {
        match &next {
            Some(id) => {
                store.set(STORE_KEY, serde_json::to_value(id).unwrap_or_default());
            }
            None => {
                store.delete(STORE_KEY);
            }
        }
    }
    if let Some(seen) = &next_seen {
        // Keep the e-mail we knew if this report has none (older MIS page).
        let mut seen = seen.clone();
        if seen.email.is_none() {
            seen.email = last
                .as_ref()
                .filter(|l| l.account == seen.account)
                .and_then(|l| l.email.clone());
        }
        remember_seen(app, &seen);
    }
    log::info!(
        "tools identity: {}",
        next.as_ref()
            .map(|i| format!("signed in ({}, tenant {})", i.persona, i.tid))
            .unwrap_or_else(|| "none".into())
    );
    super::emit_shell(app, "nga://identity", next);
    if todo.resign_spokes {
        // The same person in another of their schools: keep the profile and
        // sign the other apps in again, into the new school (school.rs).
        log::info!("school switch (same person): signing the other apps in again");
        crate::school::on_switch(app);
    }
    if todo.wipe_profile {
        // Another school or another person took over without "Sign out of
        // this computer": wipe the shared profile (cookies, storage, caches of
        // every app) so nothing of the previous one reaches them. They sign in
        // again on a clean profile.
        log::info!("another account signed in: wiping the browsing profile");
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = crate::commands::reset_local_profile(&handle);
            let _ = tauri::Emitter::emit_to(
                &handle,
                crate::webviews::SHELL,
                "nga://toast",
                crate::i18n::t("toast.accountSwitched").to_string(),
            );
        });
    }
}

/// MIS signed out (or "Sign out of this computer"): forget who it was.
pub fn clear<R: Runtime>(app: &AppHandle<R>) {
    set(app, None, None);
}

/// From the MIS page only (bridge.js). Any other page is refused.
#[tauri::command]
#[allow(clippy::too_many_arguments)] // one argument per field the MIS page reports
pub fn web_identity<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    user_id: u64,
    tid: Option<u64>,
    user_type: String,
    first_name: Option<String>,
    date_of_birth: Option<String>,
    email: Option<String>,
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
        tid: tenancy::tid_or_primary(tid),
        user_id,
        persona: persona(&user_type).to_string(),
        first_name: clip(first_name.as_deref().unwrap_or(""), 40),
        age_band: date_of_birth
            .as_deref()
            .and_then(|d| age_band(d, today()))
            .map(str::to_string),
    };
    crate::autostart::apply_default(&app, &id.persona);
    set(&app, Some(id), email.as_deref());
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
    fn a_school_switch_never_wipes_the_profile() {
        let switch = effects(Takeover::SchoolSwitch, true, true);
        assert!(
            !switch.wipe_profile,
            "a switch must not call reset_local_profile"
        );
        assert!(switch.resign_spokes);
        assert!(!switch.vault_sign_out);

        let other = effects(Takeover::OtherPerson, true, true);
        assert!(other.wipe_profile);
        assert!(!other.resign_spokes);
        assert!(other.vault_sign_out);

        // Sign-out: the vault may forget the person's tools data, nothing else.
        assert_eq!(
            effects(Takeover::None, true, true),
            Effects {
                vault_sign_out: true,
                ..Effects::default()
            }
        );
        // First sign-in: nothing.
        assert_eq!(effects(Takeover::None, true, false), Effects::default());
    }

    #[test]
    fn switch_decision_end_to_end() {
        // Last seen: the person in school 1; now MIS reports school 2, same e-mail.
        let last = Seen::new(Account::new(Some(1), 7), Some("t@nga.rw"));
        let next = Seen::new(Account::new(Some(2), 31), Some("T@nga.rw"));
        let todo = effects(tenancy::takeover(Some(&last), Some(&next)), true, true);
        assert!(!todo.wipe_profile && todo.resign_spokes);
        // Someone else in school 2.
        let stranger = Seen::new(Account::new(Some(2), 31), Some("x@nga.rw"));
        let todo = effects(tenancy::takeover(Some(&last), Some(&stranger)), true, true);
        assert!(todo.wipe_profile && !todo.resign_spokes);
    }

    #[test]
    fn today_is_a_plausible_date() {
        let (y, m, d) = today();
        assert!(y >= 2025 && (1..=12).contains(&m) && (1..=31).contains(&d));
    }
}
