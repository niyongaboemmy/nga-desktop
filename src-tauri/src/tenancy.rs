//! Which school (tenant) and which person the local stores belong to.
//!
//! Every school uses the same NGA hosts (ADR-3 in MULTI_TENANCY_GAP_FIX_PLAN.md),
//! so one computer can be used by people of several schools, and MIS user ids
//! repeat across schools (each school has its own database). Anything NGA keeps
//! on disk for a person (the notification inbox, the SSO handshake times, the
//! tools' files and keys) is therefore keyed by `<tid>:<userId>`, never by the
//! user id alone. MIS reports the tenant id with the signed-in profile
//! (`tenant.tid` from `/users/me`, or the `tid` token claim); when it doesn't
//! (an older MIS), the person belongs to tenant 1, the primary school.
//!
//! When the person on this computer changes (another school, or another
//! account), the shared browsing profile is wiped (`commands::reset_local_profile`)
//! so one school's sessions and caches never reach the next.

use serde::{Deserialize, Serialize};

/// Tenant 1 = NGA, the primary tenant: everything stored before multi-tenancy is theirs.
pub const PRIMARY_TID: u64 = 1;

pub fn primary_tid() -> u64 {
    PRIMARY_TID
}

/// A tenant id as reported, or the primary tenant when it's missing or invalid.
pub fn tid_or_primary(tid: Option<u64>) -> u64 {
    tid.filter(|t| *t > 0).unwrap_or(PRIMARY_TID)
}

/// One person in one school.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    #[serde(default = "primary_tid")]
    pub tid: u64,
    pub user_id: u64,
}

impl Account {
    pub fn new(tid: Option<u64>, user_id: u64) -> Self {
        Account {
            tid: tid_or_primary(tid),
            user_id,
        }
    }

    /// `<tid>:<userId>`, the key of this person's entries in shared stores.
    pub fn scope(&self) -> String {
        format!("{}:{}", self.tid, self.user_id)
    }

    /// The part of a per-person file name. Tenant 1 keeps the names used before
    /// multi-tenancy (`u<id>`), so existing files carry over as they are.
    pub fn file_tag(&self) -> String {
        if self.tid == PRIMARY_TID {
            format!("u{}", self.user_id)
        } else {
            format!("t{}-u{}", self.tid, self.user_id)
        }
    }
}

pub fn parse_scope(s: &str) -> Option<Account> {
    let (tid, user) = s.split_once(':')?;
    let tid: u64 = tid.parse().ok().filter(|t| *t > 0)?;
    let user_id: u64 = user.parse().ok().filter(|u| *u > 0)?;
    Some(Account { tid, user_id })
}

/// How the person on this computer changed, compared with the last one seen.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Change {
    /// Nothing known before (first sign-in on this computer, or after a wipe).
    First,
    Same,
    /// Nobody now (signed out); the last person is still remembered.
    SignedOut,
    /// Another person or another school than the last one seen.
    Switched,
}

pub fn compare(last: Option<Account>, next: Option<Account>) -> Change {
    match (last, next) {
        (_, None) => Change::SignedOut,
        (None, Some(_)) => Change::First,
        (Some(a), Some(b)) if a == b => Change::Same,
        (Some(_), Some(_)) => Change::Switched,
    }
}

/// Must the shared browsing profile be wiped before `next` carries on?
/// Only when someone else (other school or other account) takes over after
/// `last`; signing out alone keeps it (an expired session comes back as the
/// same person, with its offline data intact).
pub fn needs_profile_reset(last: Option<Account>, next: Option<Account>) -> bool {
    compare(last, next) == Change::Switched
}

// ── session.json: SSO handshake times ───────────────────────────────────────

/// `sso.<tid>:<userId>.<appKey>`: when this person last completed `app`'s SSO hop.
pub fn sso_key(account: &Account, app: &str) -> String {
    format!("sso.{}.{}", account.scope(), app)
}

/// A pre-multi-tenancy key (`sso.<appKey>`): the app it was for.
pub fn legacy_sso_app(key: &str) -> Option<&str> {
    let app = key.strip_prefix("sso.")?;
    (!app.is_empty() && !app.contains('.') && !app.contains(':')).then_some(app)
}

/// What to do with an existing `session.json` entry: `None` keeps it, `Some(None)`
/// deletes it, `Some(Some(k))` moves it to `k`. Legacy entries move to the person
/// signed in before the upgrade (tenant 1); with nobody known they are dropped
/// (the next app open just runs the SSO hop again).
pub fn migrate_sso_entry(key: &str, owner: Option<&Account>) -> Option<Option<String>> {
    let app = legacy_sso_app(key)?;
    Some(owner.map(|o| sso_key(o, app)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn acc(tid: u64, user_id: u64) -> Account {
        Account { tid, user_id }
    }

    #[test]
    fn missing_tenant_means_the_primary_school() {
        assert_eq!(Account::new(None, 7), acc(1, 7));
        assert_eq!(Account::new(Some(0), 7), acc(1, 7));
        assert_eq!(Account::new(Some(3), 7), acc(3, 7));
        // Stored before multi-tenancy: no tid field.
        let old: Account = serde_json::from_str(r#"{"userId":7}"#).unwrap();
        assert_eq!(old, acc(1, 7));
    }

    #[test]
    fn scopes_and_file_tags() {
        assert_eq!(acc(1, 7).scope(), "1:7");
        assert_eq!(acc(12, 7).scope(), "12:7");
        assert_eq!(acc(1, 7).file_tag(), "u7");
        assert_eq!(acc(12, 7).file_tag(), "t12-u7");
        assert_ne!(acc(1, 7).file_tag(), acc(12, 7).file_tag());
        assert_eq!(parse_scope("12:7"), Some(acc(12, 7)));
        for bad in ["", "7", "0:7", "1:0", "a:b", "1:7:8"] {
            assert_eq!(parse_scope(bad), None, "{bad}");
        }
    }

    #[test]
    fn same_user_id_in_another_school_is_someone_else() {
        assert_eq!(compare(None, Some(acc(1, 7))), Change::First);
        assert_eq!(compare(Some(acc(1, 7)), Some(acc(1, 7))), Change::Same);
        assert_eq!(compare(Some(acc(1, 7)), None), Change::SignedOut);
        assert_eq!(compare(None, None), Change::SignedOut);
        assert_eq!(compare(Some(acc(1, 7)), Some(acc(2, 7))), Change::Switched);
        assert_eq!(compare(Some(acc(1, 7)), Some(acc(1, 8))), Change::Switched);
    }

    #[test]
    fn profile_is_wiped_only_when_someone_else_takes_over() {
        assert!(!needs_profile_reset(None, Some(acc(1, 7))));
        assert!(!needs_profile_reset(Some(acc(1, 7)), Some(acc(1, 7))));
        assert!(!needs_profile_reset(Some(acc(1, 7)), None));
        assert!(needs_profile_reset(Some(acc(1, 7)), Some(acc(2, 7))));
        assert!(needs_profile_reset(Some(acc(2, 7)), Some(acc(2, 9))));
    }

    #[test]
    fn sso_entries_are_per_person_and_legacy_ones_move_to_tenant_one() {
        let me = acc(1, 7);
        assert_eq!(sso_key(&me, "tendo"), "sso.1:7.tendo");
        assert_eq!(legacy_sso_app("sso.tendo"), Some("tendo"));
        assert_eq!(legacy_sso_app("sso.1:7.tendo"), None);
        assert_eq!(legacy_sso_app("sso."), None);
        assert_eq!(legacy_sso_app("other"), None);
        assert_eq!(
            migrate_sso_entry("sso.tupo", Some(&me)),
            Some(Some("sso.1:7.tupo".into()))
        );
        assert_eq!(migrate_sso_entry("sso.tupo", None), Some(None));
        assert_eq!(migrate_sso_entry("sso.1:7.tupo", Some(&me)), None);
    }
}
