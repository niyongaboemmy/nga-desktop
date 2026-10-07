# NGA Desktop & ecosystem: next features analysis

*7 October 2026 · based on desktop v0.15.0 (commit 9416f4a), a full code review, production usage data, and research into school platforms from 2024 to 2026.*

This document answers three questions: what is weak in the desktop app today, which modern features the NGA ecosystem lacks, and what order to build them in. Each item names its home: **D** for the desktop app, **W** for the web apps (MIS, Task Mentor, Tendo, Tupo), or **B** for both.

---

## 1. What production tells us

| Signal | Value | What it means |
|---|---|---|
| Active Windows installs (last 24 h) | ~23 | The desktop app is in real daily use, mostly in the school lab. |
| Windows installs still on **0.8.0** | **7 of ~23 active** | About 30% of lab PCs have missed seven releases (see §2.1). |
| Active users (30 days) | 31 students, 11 teachers, 4 staff, 1 admin | Students are already the largest group. |
| Downloads | Windows 36, macOS 8 | Windows is the platform that matters. |
| Top AI features (30 days) | e-learning core lesson, assessment pack, lesson plan | Teachers use AI for **preparation**; marking and reporting have no AI help yet. |
| Parents | 0 active | Parents have no way into the platform at all. |

Two notes on the data:
- **CI test installs inflate the counts.** Every release's installer smoke test registers a fresh install, which is why each version shows exactly one stale macOS row and one stale Windows row. The real number of school installs is about 25, not 68.
- **One IP for many machines.** All school machines share one public IP (102.22.138.238), so nginx logs cannot tell lab PCs apart.

---

## 2. Fix first: weaknesses in the current desktop app

These problems already affect people. They come before any new feature.

### 2.1 Updates stall: ~30% of lab PCs are on 0.8.0 · **S** · D
- **Cause.** Updates install only when someone clicks *Update*. Lab PCs run unattended or shared, so nobody clicks.
- **Evidence.**
  - Seven 0.8.0 machines check in every few minutes and are correctly offered 0.15.0.
  - The setup .exe was downloaded only a handful of times.
  - We have no visibility when an install fails after the download.
- **Fix.**
  - (a) Install automatically, using NSIS `passive` mode, when the app is idle and no quiz or meeting is open. Also install automatically on quit.
  - (b) Report each update's outcome (`downloaded`, `installed`, `failed: <reason>`) to `/desktop/update/report`.
  - (c) Show admins a version breakdown on the MIS `/desktop` page.
  - (d) Send a `X-NGA-CI: 1` header from the smoke workflow so CI installs stay out of the stats.
- Optional minimum supported version: the server can mark old versions *required* and show a blocking prompt.

### 2.2 Notifications only work while NGA is open · **S** · D
There is no auto-start, so after a reboot teachers get no notices and no timer alerts until they open NGA themselves. Add `tauri-plugin-autostart`: a Settings toggle, start minimised to the tray, on by default for staff. **This is the biggest reliability gain for teachers.**

### 2.3 The notification inbox is lost on restart and has no actions · **M** · D
- **Today.**
  - The inbox lives only in memory.
  - On Windows, the app guesses that a notice was clicked if NGA regains focus within 6 seconds.
  - Notices have no buttons.
- **Fix.**
  - Keep the inbox in the store.
  - Use real toast activation on Windows and `UNNotificationAction` on macOS (the bindings are already present).
  - Add actions: *Open*, *Mark read*, *Snooze 10 min*, *Take attendance*.

### 2.4 Tool API calls depend on the MIS page staying alive · **L** · D
- **Today.**
  - Every tool request is evaluated inside the MIS webview, so "MIS isn't open yet" errors and AI answers dropped mid-stream are both possible.
  - Background work (identity, agenda, notification replays) runs on page `setInterval` timers.
- **Fix.** A Rust-side client with a scoped desktop token, which was step 2.1/2.2 of the original plan. It also adds PUT and DELETE, and it is required for offline sync (§3.3).

### 2.5 Privacy on shared lab PCs · **M** · D
- **Today.**
  - Notes, AI chats and cached class lists (student names) are stored as plain JSON for each user.
  - Signing out does not wipe them.
  - Windows builds are unsigned, so SmartScreen warns and antivirus flags them on school PCs.
- **Fix.**
  - Encrypt per-user stores with a key held in the OS keychain or DPAPI.
  - Add a *wipe on sign-out* option for lab mode.
  - Buy an Authenticode certificate. An Azure Trusted Signing account costs about $10 a month.

### 2.6 Silent breakage between web apps and the desktop · **M** · D+W
The desktop notification watchers depend on the exact poll URLs and response shapes of each web app, so a web-app refactor breaks desktop notices without warning. Add contract tests in each web repo that pin the watcher endpoints and the `/desktop/tools/*` responses. Also add shell e2e suites for SSO, tab switching, notification routing and update gating; today all 16 suites cover tools only.

### 2.7 Smaller fixes · **S each** · D
- **Shell translation.** Only the tools are in EN/FR/RW. The title bar, palette, settings, onboarding, menus, tray and timer alerts are English only.
- **Accessibility.** Respect `prefers-reduced-motion`, and announce toasts with `aria-live`.
- **OCR as an on-demand download.** It accounts for 5.5 MB of the 13.7 MB installer.
- **Palette preload.** Preload tools from the palette, as the launcher already does; this removes about 330 ms per open.
- **Idle webview unloading** on 4 GB machines, where four webview processes stay resident today.

---

## 3. New features, ranked for NGA

The ranking weighs four things:
1. Impact on teaching, learning and safety.
2. Whether the data already exists in the four apps.
3. Running cost, against the $0 AI policy.
4. Fit with Rwanda's CBC curriculum and patchy connectivity.

### Tier 1: highest value, mostly built on data we already have

| # | Feature | Home | Size | Why now |
|---|---|---|---|---|
| 1 | **Early-warning & intervention tracker** | W + D bell | M | Daily risk score from Tendo attendance and discipline, Task Mentor missed and low marks, and e-learning activity, using clear rules rather than machine learning. It comes with an intervention log (owner, action, review date, outcome). All the inputs exist; only the join is missing. Used by PowerSchool EWS and Panorama. |
| 2 | **Parent channel: alerts + light portal (RW/EN/FR)** | W | L | Parents are the biggest gap: zero today. Alerts cover absence and lateness, results, events and office-hours bookings, sent through Telegram (already in the Reminder Hub), SMS through a Rwandan gateway costing a few RWF per message, and a PWA portal. A desktop parent persona with a child switcher comes later. |
| 3 | **AI marking feedback (teacher approves)** | W (TM) | M | AI is used for preparation, not marking. Draft comments aligned to the rubric for each submission; the teacher edits and approves. It reuses the free-tier provider router. Used by Brisk, Toddle and MagicSchool. |
| 4 | **AI report-card comments + CBC report automation** | W | M | Draft each student's term comment from marks, attendance, discipline and exit tickets, with tone controls. Add bulk PDF reports and mark-entry deadlines. This targets the biggest workload spike of the term. |
| 5 | **Safeguarding: wellbeing check-ins + AI-chat flags** | B | M | Students now have an AI tutor, so oversight is required. Add a weekly check-in of 2–3 questions and a *Report a concern* button that goes to the counsellor. The tutor's existing `worry` signal becomes a routed alert to a named safeguarding lead. Used by Panorama and GoGuardian Beacon. |

### Tier 2: strong value, more new building

| # | Feature | Home | Size | Notes |
|---|---|---|---|---|
| 6 | **Offline-first attendance & marks (desktop as hub)** | B | L | Writes queue locally and sync when the connection returns. Read caches cover the timetable, class lists and lesson notes. It depends on §2.4. |
| 7 | **CBC competency / mastery map** | W + D tile | L | Each student's own progress on CBC competences, built from quizzes, exit tickets and assignments, visible to the student and to parents. It supports the national shift to formative assessment. |
| 8 | **Scan-and-grade for paper tests** | D capture, W grading | L | The desktop Scanner and OCR already exist. Add roster matching, answer clustering and gradebook write-back. Used by Gradescope. |
| 9 | **Staff absence & cover** | W + D notices | M | A teacher reports an absence, it is approved, and the system finds uncovered lessons and suggests free same-subject teachers from the MIS timetable. Used by Arbor. |
| 10 | **Course-grounded tutor with teacher personas** | B | M | Teachers set up *Quiz me*, *Explain* or *Revise* tutors that answer only from their e-learning course and lesson notes. This upgrades the existing tutor. Used by Google Gems + NotebookLM and Khanmigo. |
| 11 | **`nga://` deep links** | D | S–M | Emails, Telegram reminders and projector QR codes can open the exact quiz, page or tool. Today single-instance ignores its arguments. |
| 12 | **Exam lockdown for Task Mentor quizzes** | D | M | Kiosk fullscreen, shortcuts blocked, focus-loss events sent to the teacher. It builds on the existing quiz detection. |

### Tier 3: worthwhile later

| # | Feature | Home | Size |
|---|---|---|---|
| 13 | Daily practice ("daily 10") with effort streaks, using FSRS + the question bank | B | S–M |
| 14 | Notes and flashcards synced to MIS, plus AI-made decks (plan 5.4) | B | M |
| 15 | No-code rules engine on the Reminder Hub ("3 absences in a week → parent + class-teacher task") | W | M |
| 16 | Live checks for understanding over LAN, with Plickers-style printed cards for classes without student devices | D | M |
| 17 | Automated timetabling via FET export/import (free, GPL), which removes the slot mismatches already seen in MIS | W | M |
| 18 | Privacy centre for Law 058/2021: data inventory, consent, access and erase requests, retention | W | M |
| 19 | QR student IDs for gate, library and meals, with "arrived" parent alerts | B | M |
| 20 | Writing workspace with process replay, as an alternative to AI detection | W (TM) | L |
| 21 | Subject-combination (S3→S4) and career guidance | W | M |
| 22 | Global search (people, classes, courses, notes, mail) and OS calendar (ICS) export of My Day | B | M |
| 23 | Mobile-money fee statements and receipts (UrubutoPay / MoMo) | W | L |
| 24 | SDMS export for MINEDUC (enrolment, attendance, results) | W | M |
| 25 | Offline local-model tutor fallback (opt-in download), only after evaluation shows it is safe for minors | D | L |

**Not recommended:** face-recognition attendance (cost, accuracy, child privacy), and AI-writing detectors (unreliable; process replay is fairer).

---

## 4. Suggested roadmap

| Phase | Contents | Rough effort |
|---|---|---|
| **A: Reliability** (desktop 0.16) | §2.1 auto-update and reporting, §2.2 auto-start, §2.3 persistent actionable inbox, §2.7 quick fixes, shell translation | 1–2 weeks |
| **B: Safety & trust** | §2.5 encrypted stores and Windows signing, §2.6 contract and shell tests, #5 safeguarding | 2 weeks |
| **C: Teacher time** | #3 AI marking feedback, #4 report comments and CBC reports, #11 deep links | 3 weeks |
| **D: Insight** | #1 early warning and interventions, #9 staff cover | 3 weeks |
| **E: Families** | #2 parent alerts and portal, desktop parent persona | 3–4 weeks |
| **F: Resilience & curriculum** | §2.4 native API client, #6 offline-first, #7 mastery map, #8 scan-and-grade | 6+ weeks |

Phase A is small, fixes problems people already have, and ensures that later releases actually reach the lab PCs.

---

## 5. Decisions needed from the school

1. **Silent auto-updates on lab PCs:** install automatically when idle or on quit? (Recommended: yes.)
2. **Auto-start:** on by default for staff, off for students?
3. **Parent channel:** Telegram only (free) first, or budget for SMS? Who is the named safeguarding lead for AI-chat and wellbeing flags?
4. **Windows code signing:** approve about $10 a month for a certificate?
5. **Order of Phases C–E:** teacher time first, or parents first?

---

### Sources (selection)
Google Classroom Gems/NotebookLM (Workspace Updates, Sep 2025) · Turnitin Clarity & Gradescope · PowerSchool EWS & Frontline research brief (Dec 2024) · Toddle, ManageBac 2025 roundup · Arbor Workflows & cover · Panorama student check-ins · GoGuardian Beacon 2025–26 · ClassDojo / Seesaw family communication · Zeraki (Kenya) · UrubutoPay (Rwanda) · Kolibri / Learning Equality · MINEDUC SDMS (2025) · Rwanda Law 058/2021 (DLA Piper) · UNESCO GenAI guidance · PowerSchool breach (K-12 Dive, 2025) · FET timetabling.
