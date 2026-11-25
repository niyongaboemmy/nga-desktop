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
//! When another person takes over this computer, the shared browsing profile
//! is wiped (`commands::reset_local_profile`) so one person's sessions and
//! caches never reach the next. The same person moving to another of their
//! schools (MIS "Switch school", TENANT_SWITCHING_PLAN.md §4.6) is a *school
//! switch*: nothing is wiped (the profile is theirs either way, and the stores
//! are keyed by school); the other apps just sign in again into the new school.
//! A person's accounts in different schools are linked by their e-mail, as
//! MIS's `/auth/my-schools` does, but only while they stay signed in and right
//! after a switch signal (`takeover_with`, DK-ISO-2): two people can share an
//! address, so the same e-mail after a sign-out is someone else.

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

/// A sign-in as MIS reported it: the account plus the e-mail that links one
/// person's accounts across schools (None from an older MIS page).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Seen {
    #[serde(flatten)]
    pub account: Account,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

impl Seen {
    pub fn new(account: Account, email: Option<&str>) -> Self {
        Seen {
            account,
            email: email.and_then(normalise_email),
        }
    }
}

/// Lower-case, trimmed, and plausibly an address; else None (never matches).
pub fn normalise_email(e: &str) -> Option<String> {
    let e = e.trim().to_lowercase();
    let (local, domain) = e.split_once('@')?;
    (!local.is_empty() && domain.contains('.') && !e.contains(char::is_whitespace)).then_some(e)
}

/// What a change of account means for this computer's local data.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Takeover {
    /// Same account, first sign-in, or a sign-out: nothing to do.
    None,
    /// The same person (same e-mail) in another of their schools: keep the
    /// profile, sign the other apps in again into the new school.
    SchoolSwitch,
    /// Someone else (or nothing proves it's the same person): wipe the profile.
    OtherPerson,
}

pub fn takeover(last: Option<&Seen>, next: Option<&Seen>) -> Takeover {
    if compare(last.map(|s| s.account), next.map(|s| s.account)) != Change::Switched {
        return Takeover::None;
    }
    let (Some(last), Some(next)) = (last, next) else {
        return Takeover::None;
    };
    let same_person = matches!((&last.email, &next.email), (Some(a), Some(b)) if a == b);
    // Another account in the SAME school is never a switch (one person has one
    // account per school).
    if same_person && last.account.tid != next.account.tid {
        Takeover::SchoolSwitch
    } else {
        Takeover::OtherPerson
    }
}

/// How long after a switch signal a new school still counts as the same
/// person switching (DK-ISO-2). MIS's switch page asks for nothing but a
/// click (or a password at most), so two minutes is plenty.
pub const SWITCH_WINDOW_SECS: u64 = 120;

/// What has to be true, besides the same e-mail, for a change of school to be
/// a school switch rather than someone else (DK-ISO-2). Two people can share an
/// e-mail address (a family address, a reused one), so the e-mail alone never
/// proves anything across a sign-out.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct SwitchEvidence {
    /// The previous account was still signed in right up to this change: no
    /// signed-out state (MIS sign-in page, sign-out in a spoke, restart while
    /// signed out) in between.
    pub prev_signed_in: bool,
    /// A switch signal came within `SWITCH_WINDOW_SECS`: the `nga_school`
    /// cookie changed while MIS stayed signed in, or MIS's `/switch-school`
    /// page was open.
    pub recent_signal: bool,
}

/// `takeover`, downgraded to `OtherPerson` unless the evidence shows the same
/// person switching school without signing out in between.
pub fn takeover_with(last: Option<&Seen>, next: Option<&Seen>, ev: SwitchEvidence) -> Takeover {
    match takeover(last, next) {
        Takeover::SchoolSwitch if !(ev.prev_signed_in && ev.recent_signal) => Takeover::OtherPerson,
        t => t,
    }
}

/// Is a switch signal seen `since_signal` ago still recent enough?
pub fn signal_is_recent(since_signal: Option<std::time::Duration>) -> bool {
    since_signal.is_some_and(|d| d.as_secs() < SWITCH_WINDOW_SECS)
}

/// Must the shared browsing profile be wiped before `next` carries on?
/// Only when someone else takes over after `last`; signing out alone keeps it
/// (an expired session comes back as the same person, with its offline data
/// intact), and so does the same person switching school. (tools/identity.rs
/// acts on `takeover` directly; this is the rule as the tests state it.)
#[cfg(test)]
pub fn needs_profile_reset(last: Option<&Seen>, next: Option<&Seen>) -> bool {
    takeover(last, next) == Takeover::OtherPerson
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

    fn seen(tid: u64, user_id: u64, email: Option<&str>) -> Seen {
        Seen::new(acc(tid, user_id), email)
    }

    #[test]
    fn profile_is_wiped_only_when_someone_else_takes_over() {
        let r = |a: Option<Seen>, b: Option<Seen>| needs_profile_reset(a.as_ref(), b.as_ref());
        assert!(!r(None, Some(seen(1, 7, None))));
        assert!(!r(Some(seen(1, 7, None)), Some(seen(1, 7, None))));
        assert!(!r(Some(seen(1, 7, None)), None));
        // No e-mail to prove it's the same person: as before, a wipe.
        assert!(r(Some(seen(1, 7, None)), Some(seen(2, 7, None))));
        assert!(r(Some(seen(2, 7, None)), Some(seen(2, 9, None))));
        assert!(r(Some(seen(1, 7, Some("a@x.rw"))), Some(seen(2, 9, None))));
    }

    #[test]
    fn same_email_in_another_school_is_a_switch_not_a_wipe() {
        let t = |a: Seen, b: Seen| takeover(Some(&a), Some(&b));
        let me = seen(1, 7, Some("Teacher@School.rw "));
        assert_eq!(
            t(me.clone(), seen(2, 31, Some("teacher@school.rw"))),
            Takeover::SchoolSwitch
        );
        assert!(!needs_profile_reset(
            Some(&me),
            Some(&seen(2, 31, Some("teacher@school.rw")))
        ));
        // ...and back again.
        assert_eq!(
            t(seen(2, 31, Some("teacher@school.rw")), me.clone()),
            Takeover::SchoolSwitch
        );
        // Another e-mail in another school: someone else.
        assert_eq!(
            t(me.clone(), seen(2, 31, Some("other@school.rw"))),
            Takeover::OtherPerson
        );
        // Same school, other account: someone else, whatever the e-mail says.
        assert_eq!(
            t(me.clone(), seen(1, 8, Some("teacher@school.rw"))),
            Takeover::OtherPerson
        );
        // Unchanged, first sign-in, sign-out: nothing.
        assert_eq!(t(me.clone(), me.clone()), Takeover::None);
        assert_eq!(takeover(None, Some(&me)), Takeover::None);
        assert_eq!(takeover(Some(&me), None), Takeover::None);
    }

    #[test]
    fn dk_iso_2_same_email_after_a_sign_out_is_someone_else() {
        let x = seen(1, 7, Some("family@home.rw"));
        let y = seen(2, 31, Some("family@home.rw"));
        // X signed out (identity cleared), then Y signs in with the same e-mail.
        let after_sign_out = SwitchEvidence {
            prev_signed_in: false,
            recent_signal: true,
        };
        assert_eq!(
            takeover_with(Some(&x), Some(&y), after_sign_out),
            Takeover::OtherPerson
        );
        // Still signed in, but no switch signal (no /switch-school, no cookie change).
        let no_signal = SwitchEvidence {
            prev_signed_in: true,
            recent_signal: false,
        };
        assert_eq!(
            takeover_with(Some(&x), Some(&y), no_signal),
            Takeover::OtherPerson
        );
        assert_eq!(
            takeover_with(Some(&x), Some(&y), SwitchEvidence::default()),
            Takeover::OtherPerson
        );
    }

    #[test]
    fn dk_iso_2_switch_without_sign_out_stays_a_switch() {
        let x = seen(1, 7, Some("teacher@school.rw"));
        let y = seen(2, 31, Some("teacher@school.rw"));
        let ev = SwitchEvidence {
            prev_signed_in: true,
            recent_signal: true,
        };
        assert_eq!(
            takeover_with(Some(&x), Some(&y), ev),
            Takeover::SchoolSwitch
        );
        // Evidence never turns someone else into a switch.
        let z = seen(2, 31, Some("other@school.rw"));
        assert_eq!(takeover_with(Some(&x), Some(&z), ev), Takeover::OtherPerson);
        // Nor a sign-out or a first sign-in into a takeover.
        assert_eq!(takeover_with(Some(&x), None, ev), Takeover::None);
        assert_eq!(takeover_with(None, Some(&y), ev), Takeover::None);
    }

    #[test]
    fn dk_iso_2_switch_signals_expire() {
        use std::time::Duration;
        assert!(!signal_is_recent(None));
        assert!(signal_is_recent(Some(Duration::from_secs(0))));
        assert!(signal_is_recent(Some(Duration::from_secs(
            SWITCH_WINDOW_SECS - 1
        ))));
        assert!(!signal_is_recent(Some(Duration::from_secs(
            SWITCH_WINDOW_SECS
        ))));
        assert!(!signal_is_recent(Some(Duration::from_secs(3600))));
    }

    #[test]
    fn emails_are_normalised_and_junk_never_matches() {
        assert_eq!(normalise_email(" A@B.rw "), Some("a@b.rw".into()));
        for bad in ["", "   ", "nobody", "@b.rw", "a@b", "a b@c.rw"] {
            assert_eq!(normalise_email(bad), None, "{bad}");
        }
        let junk = |e| seen(1, 7, Some(e));
        assert_eq!(
            takeover(Some(&junk("x")), Some(&seen(2, 7, Some("x")))),
            Takeover::OtherPerson
        );
    }

    #[test]
    fn last_seen_reads_what_older_versions_stored() {
        // Stored before school switching: an Account, no e-mail.
        let old: Seen = serde_json::from_str(r#"{"tid":2,"userId":7}"#).unwrap();
        assert_eq!(old, seen(2, 7, None));
        let pre_tenancy: Seen = serde_json::from_str(r#"{"userId":7}"#).unwrap();
        assert_eq!(pre_tenancy, seen(1, 7, None));
        let s = serde_json::to_value(seen(2, 7, Some("a@b.rw"))).unwrap();
        assert_eq!(s, serde_json::json!({"tid":2,"userId":7,"email":"a@b.rw"}));
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
