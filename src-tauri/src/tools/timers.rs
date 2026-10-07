//! Timers that keep running when no tool is on screen.
//!
//! JavaScript timers in a hidden webview are throttled, so deadlines live here:
//! a countdown rings on time with the panel closed or NGA minimised, and a
//! timer survives a restart (deadlines are wall-clock times in the store).
//!
//! Kinds:
//! - **countdown**: rings once at zero.
//! - **stopwatch**: counts up, with laps.
//! - **focus**: work / break rounds (Pomodoro-style, every length adjustable).
//!   While a work phase runs, NGA's Do Not Disturb holds the apps' banners.
//!
//! The state machine (`Timer`) is pure and takes `now` as an argument, so it
//! is tested with a fake clock.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::StoreExt;

const STORE: &str = "tools-timers.json";
const MAX_TIMERS: usize = 20;
const MAX_LAPS: usize = 99;
const MIN_MS: u64 = 1_000;
const MAX_MS: u64 = 24 * 60 * 60 * 1000;
/// A timer that ran out this long before NGA saw it finished while NGA was closed.
const LATE_MS: u64 = 5_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Countdown,
    Stopwatch,
    Focus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Work,
    Break,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Focus {
    pub work_ms: u64,
    pub break_ms: u64,
    pub rounds: u32,
    /// 1-based round in progress.
    pub round: u32,
    pub phase: Phase,
    /// Work time completed so far (finished work phases).
    pub focused_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timer {
    pub id: u64,
    pub label: String,
    pub kind: Kind,
    /// Countdown: its length. Focus: the current phase's length. Stopwatch: 0.
    pub duration_ms: u64,
    /// Time counted before `running_since` (accumulated across pauses).
    pub elapsed_ms: u64,
    /// Wall-clock ms when it last started running; None = paused / finished.
    pub running_since: Option<u64>,
    pub finished_at: Option<u64>,
    pub laps: Vec<u64>,
    pub focus: Option<Focus>,
    pub created_at: u64,
}

/// What happened on a tick (for the alert).
#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    Finished {
        label: String,
        late: bool,
    },
    BreakStarts {
        label: String,
        round: u32,
        rounds: u32,
    },
    WorkStarts {
        label: String,
        round: u32,
        rounds: u32,
    },
    FocusDone {
        label: String,
        focused_ms: u64,
    },
}

impl Timer {
    pub fn countdown(id: u64, label: &str, duration_ms: u64, now: u64) -> Timer {
        Timer {
            id,
            label: clip(label),
            kind: Kind::Countdown,
            duration_ms: duration_ms.clamp(MIN_MS, MAX_MS),
            elapsed_ms: 0,
            running_since: Some(now),
            finished_at: None,
            laps: vec![],
            focus: None,
            created_at: now,
        }
    }

    pub fn stopwatch(id: u64, label: &str, now: u64) -> Timer {
        Timer {
            kind: Kind::Stopwatch,
            duration_ms: 0,
            ..Timer::countdown(id, label, MIN_MS, now)
        }
    }

    pub fn focus(
        id: u64,
        label: &str,
        work_ms: u64,
        break_ms: u64,
        rounds: u32,
        now: u64,
    ) -> Timer {
        let work_ms = work_ms.clamp(60_000, 3 * 60 * 60 * 1000);
        let break_ms = break_ms.clamp(60_000, 60 * 60 * 1000);
        Timer {
            kind: Kind::Focus,
            duration_ms: work_ms,
            focus: Some(Focus {
                work_ms,
                break_ms,
                rounds: rounds.clamp(1, 12),
                round: 1,
                phase: Phase::Work,
                focused_ms: 0,
            }),
            ..Timer::countdown(id, label, work_ms, now)
        }
    }

    pub fn elapsed(&self, now: u64) -> u64 {
        self.elapsed_ms
            + self
                .running_since
                .map(|s| now.saturating_sub(s))
                .unwrap_or(0)
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn remaining(&self, now: u64) -> u64 {
        self.duration_ms.saturating_sub(self.elapsed(now))
    }

    pub fn running(&self) -> bool {
        self.running_since.is_some()
    }

    /// When the current phase runs out (wall clock), if it is running and counts down.
    pub fn deadline(&self) -> Option<u64> {
        if self.kind == Kind::Stopwatch {
            return None;
        }
        let since = self.running_since?;
        Some(since + self.duration_ms.saturating_sub(self.elapsed_ms))
    }

    pub fn pause(&mut self, now: u64) {
        if self.running() {
            self.elapsed_ms = self.elapsed(now);
            self.running_since = None;
        }
    }

    pub fn resume(&mut self, now: u64) {
        if !self.running() && self.finished_at.is_none() {
            self.running_since = Some(now);
        }
    }

    /// Back to the start, paused (a countdown keeps its length; focus restarts round 1).
    pub fn reset(&mut self) {
        self.elapsed_ms = 0;
        self.running_since = None;
        self.finished_at = None;
        self.laps.clear();
        if let Some(f) = self.focus.as_mut() {
            f.round = 1;
            f.phase = Phase::Work;
            f.focused_ms = 0;
            self.duration_ms = f.work_ms;
        }
    }

    pub fn lap(&mut self, now: u64) {
        if self.kind == Kind::Stopwatch && self.running() && self.laps.len() < MAX_LAPS {
            self.laps.push(self.elapsed(now));
        }
    }

    /// Advance past every deadline that has passed. Returns the events, oldest first.
    pub fn tick(&mut self, now: u64) -> Vec<Event> {
        let mut events = vec![];
        // A long sleep can pass several focus phases; never loop forever.
        for _ in 0..32 {
            let Some(deadline) = self.deadline() else {
                break;
            };
            if now < deadline {
                break;
            }
            match self.kind {
                Kind::Countdown => {
                    self.elapsed_ms = self.duration_ms;
                    self.running_since = None;
                    self.finished_at = Some(deadline);
                    events.push(Event::Finished {
                        label: self.label.clone(),
                        late: now - deadline > LATE_MS,
                    });
                }
                Kind::Focus => {
                    let f = self.focus.as_mut().expect("focus timer");
                    match f.phase {
                        Phase::Work => {
                            f.focused_ms += f.work_ms;
                            if f.round >= f.rounds {
                                self.elapsed_ms = self.duration_ms;
                                self.running_since = None;
                                self.finished_at = Some(deadline);
                                events.push(Event::FocusDone {
                                    label: self.label.clone(),
                                    focused_ms: f.focused_ms,
                                });
                            } else {
                                f.phase = Phase::Break;
                                self.duration_ms = f.break_ms;
                                self.elapsed_ms = 0;
                                self.running_since = Some(deadline);
                                events.push(Event::BreakStarts {
                                    label: self.label.clone(),
                                    round: f.round,
                                    rounds: f.rounds,
                                });
                            }
                        }
                        Phase::Break => {
                            f.round += 1;
                            f.phase = Phase::Work;
                            self.duration_ms = f.work_ms;
                            self.elapsed_ms = 0;
                            self.running_since = Some(deadline);
                            events.push(Event::WorkStarts {
                                label: self.label.clone(),
                                round: f.round,
                                rounds: f.rounds,
                            });
                        }
                    }
                }
                Kind::Stopwatch => break,
            }
        }
        events
    }

    /// End of the work phase now running, if any (for Do Not Disturb).
    pub fn work_deadline(&self) -> Option<u64> {
        match &self.focus {
            Some(f) if f.phase == Phase::Work => self.deadline(),
            _ => None,
        }
    }
}

fn clip(label: &str) -> String {
    label.trim().chars().take(40).collect()
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// The alert text for an event: (title, body).
pub fn alert_text(e: &Event) -> (String, String) {
    use crate::i18n::{t, tf};
    let name = |l: &str, fallback: &str| {
        if l.is_empty() {
            t(fallback).to_string()
        } else {
            l.to_string()
        }
    };
    match e {
        Event::Finished { label, late } => (
            format!("⏰ {}", name(label, "timer.timer")),
            t(if *late { "timer.closed" } else { "timer.up" }).to_string(),
        ),
        Event::BreakStarts {
            label,
            round,
            rounds,
        } => {
            let (r, n) = (round.to_string(), rounds.to_string());
            (
                format!(
                    "☕ {}",
                    tf("timer.break", &[("name", &name(label, "timer.focus"))])
                ),
                tf("timer.breakBody", &[("round", &r), ("rounds", &n)]),
            )
        }
        Event::WorkStarts {
            label,
            round,
            rounds,
        } => {
            let (r, n) = (round.to_string(), rounds.to_string());
            (
                format!(
                    "🎯 {}",
                    tf("timer.back", &[("name", &name(label, "timer.focus"))])
                ),
                tf("timer.round", &[("round", &r), ("rounds", &n)]),
            )
        }
        Event::FocusDone { label, focused_ms } => (
            format!(
                "✅ {}",
                tf("timer.done", &[("name", &name(label, "timer.focus"))])
            ),
            tf(
                "timer.done.body",
                &[("min", &(focused_ms / 60_000).to_string())],
            ),
        ),
    }
}

// ── State, persistence, the ticking loop ─────────────────────────────────────

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Saved {
    timers: Vec<Timer>,
    next_id: u64,
}

#[derive(Default)]
pub struct Timers {
    inner: Mutex<Option<Saved>>,
    /// The Do Not Disturb end time a focus session set (so we only undo our own).
    dnd_ours: Mutex<Option<u64>>,
}

fn with<R: Runtime, T>(app: &AppHandle<R>, f: impl FnOnce(&mut Saved) -> T) -> T {
    let state = app.state::<Timers>();
    let mut guard = state.inner.lock().unwrap();
    let saved = guard.get_or_insert_with(|| {
        app.store(STORE)
            .ok()
            .and_then(|s| s.get("state"))
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default()
    });
    f(saved)
}

/// A countdown, stopwatch or focus session is running (a teacher may be using it
/// on the projector): auto-updates wait, since they restart NGA.
pub fn any_running<R: Runtime>(app: &AppHandle<R>) -> bool {
    with(app, |s| s.timers.iter().any(|t| t.running()))
}

fn persist_and_publish<R: Runtime>(app: &AppHandle<R>) {
    let (value, list) = with(app, |s| {
        (
            serde_json::to_value(&*s).unwrap_or_default(),
            s.timers.clone(),
        )
    });
    if let Ok(store) = app.store(STORE) {
        store.set("state", value);
    }
    sync_dnd(app, &list);
    super::emit_shell(app, "nga://timers", list);
}

/// A focus work phase holds the apps' banners (NGA Do Not Disturb) until it
/// ends; a break, a pause or a deleted session lets them through again. Only
/// ever undoes a Do Not Disturb that a focus session set.
fn sync_dnd<R: Runtime>(app: &AppHandle<R>, list: &[Timer]) {
    let want = list.iter().filter_map(Timer::work_deadline).max();
    let state = app.state::<Timers>();
    let mut ours = state.dnd_ours.lock().unwrap();
    let Ok(store) = app.store("settings.json") else {
        return;
    };
    let current = store.get("dndUntil").and_then(|v| v.as_u64()).unwrap_or(0);
    match want {
        Some(until) if current < until => {
            store.set("dndUntil", until);
            *ours = Some(until);
        }
        Some(_) => {}
        None => {
            if let Some(mine) = ours.take() {
                if current == mine {
                    store.set("dndUntil", 0);
                }
            }
        }
    }
    let _ = store.save();
}

fn ring<R: Runtime>(app: &AppHandle<R>, events: &[Event]) {
    // Several at once (NGA was closed): one alert for the latest is enough.
    let Some(last) = events.last() else { return };
    let (title, body) = alert_text(last);
    log::info!(
        "tools: timer alert ({})",
        match last {
            Event::Finished { .. } => "finished",
            Event::BreakStarts { .. } => "break",
            Event::WorkStarts { .. } => "work",
            Event::FocusDone { .. } => "focus done",
        }
    );
    let focused = app
        .get_window(crate::webviews::WINDOW)
        .map(|w| w.is_focused().unwrap_or(false) && w.is_visible().unwrap_or(false))
        .unwrap_or(false)
        || app.webview_windows().iter().any(|(l, w)| {
            super::is_shell_label(l)
                && l != crate::overlay::OVERLAY
                && w.is_focused().unwrap_or(false)
        });
    // The shell always plays the chime and shows a toast when NGA is in front.
    super::emit_shell(
        app,
        "nga://tool-alert",
        serde_json::json!({ "title": title, "body": body, "focused": focused }),
    );
    // A timer the person set always rings (like a phone alarm), even under
    // Do Not Disturb: when NGA isn't in front, as a system banner.
    if !focused {
        crate::os_notify::show(
            app,
            crate::os_notify::Banner {
                // Outside the inbox's id range: clicking it just brings NGA forward.
                id: 4_000_000_000 + (now_ms() % 1_000_000),
                app_key: "tools",
                app_name: crate::i18n::t("timer.app"),
                title: &title,
                body: &body,
                sound: true,
            },
        );
    }
}

fn tick<R: Runtime>(app: &AppHandle<R>) {
    let now = now_ms();
    let (events, focused) = with(app, |s| {
        let mut events = vec![];
        let mut focused = 0;
        for t in s.timers.iter_mut() {
            let before = t.focus.as_ref().map(|f| f.focused_ms).unwrap_or(0);
            events.extend(t.tick(now));
            focused += t.focus.as_ref().map(|f| f.focused_ms).unwrap_or(0) - before;
        }
        (events, focused)
    });
    if focused > 0 {
        log_focus(app, now, focused);
    }
    if !events.is_empty() {
        ring(app, &events);
        persist_and_publish(app);
    }
}

/// Completed focus work goes into the signed-in person's own tool file (the
/// Focus tool shows "focused today"). Nobody signed in: nothing is kept.
fn log_focus<R: Runtime>(app: &AppHandle<R>, at: u64, ms: u64) {
    let Some(id) = super::identity::get(app) else {
        return;
    };
    let Ok(store) = app.store(format!("tools-u{}.json", id.user_id)) else {
        return;
    };
    let mut list = store
        .get("focusSessions")
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();
    list.push(serde_json::json!({ "at": at, "ms": ms }));
    let keep = list.len().saturating_sub(1000);
    store.set(
        "focusSessions",
        serde_json::Value::Array(list.split_off(keep)),
    );
}

/// Start the loop (and catch up on anything that ran out while NGA was closed).
pub fn spawn<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        // Let the shell come up first, so a "finished while closed" toast is seen.
        tokio::time::sleep(Duration::from_secs(3)).await;
        sync_dnd(&app, &with(&app, |s| s.timers.clone()));
        loop {
            tick(&app);
            tokio::time::sleep(Duration::from_millis(400)).await;
        }
    });
}

// ── Commands (shell + tool windows) ──────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTimer {
    pub kind: Kind,
    pub label: Option<String>,
    pub duration_ms: Option<u64>,
    pub work_ms: Option<u64>,
    pub break_ms: Option<u64>,
    pub rounds: Option<u32>,
}

#[tauri::command]
pub fn timers_list<R: Runtime>(app: AppHandle<R>) -> Vec<Timer> {
    with(&app, |s| s.timers.clone())
}

#[tauri::command]
pub fn timer_create<R: Runtime>(app: AppHandle<R>, timer: NewTimer) -> Result<Timer, String> {
    let now = now_ms();
    let label = timer.label.unwrap_or_default();
    let created = with(&app, |s| -> Result<Timer, String> {
        if s.timers.len() >= MAX_TIMERS {
            return Err(format!("At most {MAX_TIMERS} timers at once"));
        }
        s.next_id += 1;
        let id = s.next_id;
        let t = match timer.kind {
            Kind::Countdown => {
                let ms = timer.duration_ms.ok_or("missing length")?;
                if !(MIN_MS..=MAX_MS).contains(&ms) {
                    return Err("Choose between 1 second and 24 hours".into());
                }
                Timer::countdown(id, &label, ms, now)
            }
            Kind::Stopwatch => Timer::stopwatch(id, &label, now),
            Kind::Focus => Timer::focus(
                id,
                &label,
                timer.work_ms.unwrap_or(25 * 60_000),
                timer.break_ms.unwrap_or(5 * 60_000),
                timer.rounds.unwrap_or(4),
                now,
            ),
        };
        s.timers.push(t.clone());
        Ok(t)
    })?;
    persist_and_publish(&app);
    Ok(created)
}

#[tauri::command]
pub fn timer_action<R: Runtime>(app: AppHandle<R>, id: u64, action: String) -> Result<(), String> {
    let now = now_ms();
    with(&app, |s| -> Result<(), String> {
        if action == "delete" {
            s.timers.retain(|t| t.id != id);
            return Ok(());
        }
        let t = s
            .timers
            .iter_mut()
            .find(|t| t.id == id)
            .ok_or("no such timer")?;
        match action.as_str() {
            "pause" => t.pause(now),
            "resume" => t.resume(now),
            "reset" => t.reset(),
            "restart" => {
                t.reset();
                t.resume(now);
            }
            "lap" => t.lap(now),
            _ => return Err("unknown action".into()),
        }
        Ok(())
    })?;
    persist_and_publish(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: u64 = 60_000;

    #[test]
    fn countdown_rings_once_at_zero() {
        let mut t = Timer::countdown(1, "Exam", 5 * MIN, 1_000);
        assert_eq!(t.remaining(1_000 + 2 * MIN), 3 * MIN);
        assert!(t.tick(1_000 + 5 * MIN - 1).is_empty());
        let ev = t.tick(1_000 + 5 * MIN);
        assert_eq!(
            ev,
            vec![Event::Finished {
                label: "Exam".into(),
                late: false
            }]
        );
        assert!(!t.running());
        assert_eq!(t.remaining(1_000 + 10 * MIN), 0);
        assert!(t.tick(1_000 + 10 * MIN).is_empty(), "rings only once");
    }

    #[test]
    fn pausing_stops_the_clock() {
        let mut t = Timer::countdown(1, "", 10 * MIN, 0);
        t.pause(3 * MIN);
        assert_eq!(t.remaining(9 * MIN), 7 * MIN);
        assert!(t.tick(60 * MIN).is_empty(), "a paused timer never rings");
        t.resume(60 * MIN);
        assert_eq!(t.deadline(), Some(67 * MIN));
        assert_eq!(t.tick(67 * MIN).len(), 1);
    }

    #[test]
    fn finishing_while_closed_is_reported_as_late() {
        let mut t = Timer::countdown(1, "Tea", MIN, 0);
        let ev = t.tick(30 * MIN);
        assert_eq!(
            ev,
            vec![Event::Finished {
                label: "Tea".into(),
                late: true
            }]
        );
        assert_eq!(
            t.finished_at,
            Some(MIN),
            "finished at its deadline, not when seen"
        );
    }

    #[test]
    fn reset_and_restart() {
        let mut t = Timer::countdown(1, "", 2 * MIN, 0);
        t.tick(5 * MIN);
        t.reset();
        assert!(!t.running() && t.finished_at.is_none());
        assert_eq!(t.remaining(10 * MIN), 2 * MIN);
        t.resume(10 * MIN);
        assert_eq!(t.deadline(), Some(12 * MIN));
    }

    #[test]
    fn stopwatch_counts_up_with_laps_and_never_rings() {
        let mut t = Timer::stopwatch(1, "Run", 0);
        t.lap(10_000);
        t.lap(25_000);
        t.pause(30_000);
        t.lap(40_000);
        assert_eq!(t.laps, vec![10_000, 25_000], "no laps while paused");
        assert_eq!(t.elapsed(99_000), 30_000);
        assert!(t.tick(10 * 24 * 60 * MIN).is_empty());
        assert_eq!(t.deadline(), None);
    }

    #[test]
    fn focus_runs_work_break_rounds_then_finishes() {
        let mut t = Timer::focus(1, "Revision", 25 * MIN, 5 * MIN, 2, 0);
        assert_eq!(t.work_deadline(), Some(25 * MIN));
        assert_eq!(
            t.tick(25 * MIN),
            vec![Event::BreakStarts {
                label: "Revision".into(),
                round: 1,
                rounds: 2
            }]
        );
        assert_eq!(t.work_deadline(), None, "no Do Not Disturb during a break");
        assert_eq!(t.deadline(), Some(30 * MIN));
        assert_eq!(
            t.tick(30 * MIN),
            vec![Event::WorkStarts {
                label: "Revision".into(),
                round: 2,
                rounds: 2
            }]
        );
        assert_eq!(
            t.tick(55 * MIN),
            vec![Event::FocusDone {
                label: "Revision".into(),
                focused_ms: 50 * MIN
            }]
        );
        assert!(!t.running());
        assert!(t.tick(999 * MIN).is_empty());
    }

    #[test]
    fn focus_catches_up_after_a_long_sleep_without_drift() {
        let mut t = Timer::focus(1, "", 25 * MIN, 5 * MIN, 4, 0);
        // Laptop lid closed for 62 minutes: 0-25 work, 25-30 break, 30-55 work,
        // 55-60 break, so now in round 3's work phase (60-85).
        let ev = t.tick(62 * MIN);
        assert_eq!(ev.len(), 4);
        let f = t.focus.as_ref().unwrap();
        assert_eq!((f.round, f.phase, f.focused_ms), (3, Phase::Work, 50 * MIN));
        assert_eq!(
            t.deadline(),
            Some(85 * MIN),
            "phases chain from deadlines, not from now"
        );
    }

    #[test]
    fn focus_reset_starts_round_one_again() {
        let mut t = Timer::focus(1, "", 25 * MIN, 5 * MIN, 4, 0);
        t.tick(26 * MIN);
        t.reset();
        let f = t.focus.as_ref().unwrap();
        assert_eq!((f.round, f.phase, f.focused_ms), (1, Phase::Work, 0));
        assert_eq!(t.duration_ms, 25 * MIN);
    }

    #[test]
    fn lengths_are_clamped_and_labels_clipped() {
        let t = Timer::countdown(1, &"x".repeat(100), 10, 0);
        assert_eq!(t.duration_ms, MIN_MS);
        assert_eq!(t.label.chars().count(), 40);
        let f = Timer::focus(1, "", 1, 1, 99, 0);
        let fx = f.focus.unwrap();
        assert_eq!((fx.work_ms, fx.break_ms, fx.rounds), (MIN, MIN, 12));
    }

    #[test]
    fn alert_texts_are_friendly() {
        let (t, b) = alert_text(&Event::Finished {
            label: "".into(),
            late: false,
        });
        assert_eq!((t.as_str(), b.as_str()), ("⏰ Timer", "Time's up"));
        let (_, b) = alert_text(&Event::FocusDone {
            label: "".into(),
            focused_ms: 100 * MIN,
        });
        assert!(b.starts_with("100 min"));
    }

    #[test]
    fn saved_state_round_trips() {
        let s = Saved {
            timers: vec![Timer::focus(3, "A", 25 * MIN, 5 * MIN, 4, 7)],
            next_id: 3,
        };
        let v = serde_json::to_value(&s).unwrap();
        let back: Saved = serde_json::from_value(v).unwrap();
        assert_eq!(back.timers, s.timers);
        assert_eq!(back.next_id, 3);
    }
}
