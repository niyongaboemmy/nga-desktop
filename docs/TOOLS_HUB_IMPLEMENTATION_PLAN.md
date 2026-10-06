# NGA Desktop — Tools Hub: Research, Recommendations & Implementation Plan

> NGA Desktop already hosts the four NGA apps: MIS, Task Mentor, Tendo and Tupo. This plan adds a fifth area, **Tools**. It is a set of small, built-in helpers that students, teachers, staff and parents use alongside the apps. Examples include a calculator, timers, an AI assistant, a calendar, study aids, classroom aids and a few learning games.
>
> Most tools work **offline** and live inside the desktop shell, not inside a web app. They take the user's role, timetable and class lists from MIS. Each person sees only the tools that fit them, and games and AI turn off automatically during lessons and exams.

| | |
|---|---|
| **Status** | **v3: approved for development.** All recommendations were accepted on 2026-10-05, with three changes: AI at $0 (§5.7), a full games programme (§6.7), and translation review by permission (§6.3). See §0 |
| **Date** | 2026-10-05 |
| **Repo** | `nga-desktop`. Phases 2, 3, 6 and 7 also need PRs in `nga_central_mis` |
| **Based on** | nga-desktop v0.2.5 (Tauri 2.12.1, React 19, Vite 8); MIS `services/aiProviders` (6 providers) |
| **Audience** | NGA developers: frontend (React/TS), Rust (Tauri), backend (MIS Express/Sequelize) |
| **Estimated effort** | About **26–27 developer-weeks** across 9 phases (about 12–14 calendar weeks with 3 developers on two parallel tracks). Phase 1 alone is useful and shippable |
| **Budget** | **$0. Free solutions only for now** (owner decision, 2026-10-05). Paid options that would help later are listed in §11.3 and are not part of this build |

---

## Implementation status

| Phase | Status | Notes |
|---|---|---|
| 0 Foundations | ✅ Built (branch `feat/tools-hub-phase-1`) | Registry, panel (resizable, search, favourites), ⌘K + menu (⌘/Ctrl+⇧T), pop-out + present windows, `tools` capability, i18n EN/FR/RW, licence check in CI, optional global shortcut |
| 1 Everyday offline tools | ✅ Built, tested | Calculator, Timers, Focus, Notes, Unit converter, Date calculator, QR code |
| 3 (part) Ask AI for staff | ✅ Built (desktop 0.4.0 + MIS `/desktop/tools/ai/*`) | Streaming chat on existing providers with audience routing (`services/aiProviders/chat.ts`); staff/teachers/admins only (D1); daily caps 40 (admin 60); emails/phones scrubbed. **Not yet:** tutor pipeline, leak check, conversation logging/review (needed before students, 3B) |
| UI v2 | ✅ Built (0.4.0) | Tools open as a centred modal in the overlay window (replaces the side panel); neutral dark theme; primary-button hover fix; steppers |
| 2 (part) Calendar | ✅ Built (0.5.0 + MIS `/desktop/tools/agenda`, `/policy`) | My Day agenda (lessons, office hours, quizzes, meetings); policy windows from the live-lessons rule and Task Mentor quiz pairs. Toolbar tooltips (native tooltip window) |
| 4 Classroom kit | ✅ Built (0.6.0 + MIS `/desktop/tools/classes`) | Name picker, groups, noise meter, work-mode signs, classroom screen, whiteboard, grade calculator |
| 5 Study kit | ✅ Built (0.7.0) | Graphing calculator, periodic table + molar mass, 76 formula sheets, FSRS flashcards (own decks; MIS deck sync not yet) |
| 6 Games | ✅ Built (0.8.0 + MIS #74–#76, migrations 105–106) | Brain breaks hub: 15 games + Breathe + Stand & Stretch, gate (exam → lesson → switches → quiet hours → budget → cool-down), play-time sync, MIS admin page `/desktop-tools` with Igisoro super-admin approval. 0.9.0 (+ MIS #77, migration 107): teacher "Class game time" (6.5), per-student exceptions on the MIS page (6.6), Typing Tutor (6.12). **Not yet:** Tatham puzzles (Bridges, Untangle); exceptions set by class teachers (MIS page is DESKTOP_TOOLS_CONFIGURE only) |
| 3B, 7 (rest), 8 | Not started | Student AI tutor; PDF/scanner/OCR + translations workspace; hardening |

**Deviations from the plan, and why:**
- **Identity:** instead of Phase 2's tools token, Phase 1 uses `web_identity`. The MIS page reports its own cached profile (id, user type, first name, date of birth turned into an age band), never the token. It is refused from any other page. This is enough for per-person data and persona; the token is still needed in Phase 2 for API calls.
- **Storage:** per-person JSON files (`tools-u<id>.json`, tauri-plugin-store) instead of SQLite. Notes at this scale don't need SQL, and it avoids adding sqlx to the binary. Revisit if a tool needs queries.
- **Currency conversion:** left out of the converter for now. It needs a rates source over the network, which comes with Phase 2's API access.
- **Games (Phase 6):** play time is counted in the game frame (TypeScript, `games/useGames.ts`), not `games.rs`: it already knows visibility, focus and idleness, and keeps the logic in one place with the gate. Lights Out, Sliding Tiles, Mines and Picture Logic are own code instead of Tatham WASM (no asset pack to ship). MIS stores one JSON settings row (`DesktopToolSetting`) instead of four tables; audience rules beyond persona, class game time and overrides come later.
- **Alert text** (timer banners) is English only for now. It comes from Rust; the UI around it is translated.

**How tools reach NGA MIS (0.4.0):** via the MIS page, not a desktop token. `tools_api` (Rust) → `__ngaToolsApi` in the MIS webview (bridge.js) → `fetch(api + /desktop/tools/…)` with MIS's own session → `web_tools_api_event` → `nga://tools-api`. Only `/desktop/tools/` paths are allowed, checked in Rust and again in the page. NDJSON answers stream back in ~40 ms batches. The token never reaches the shell, and no CORS change is needed. Phase 2's tools token stays optional.

**How it was tested:**
- 128 unit tests (vitest), including 66 calculator cases and the dates/holidays, units, QR, notes and i18n completeness tests.
- 44 Rust tests (timer state machine with a fake clock, identity, files, windows).
- Headless UI runs in WebKit and Chromium, light and dark, with mocked native calls (19 checks plus screenshots).
- A native self-test inside the real app, built with `VITE_NGA_SELFTEST=1`; results go to `Downloads/nga-tools-selftest.txt`. It checks:
  - permissions;
  - timers ringing and the alert event;
  - Do Not Disturb during focus;
  - pop-out and present windows, including a tool window calling its own commands;
  - refusal of bad tool ids and executable file names;
  - the shortcut.

---

## Contents

0. [What changed in v3](#0-what-changed-in-v3-2026-10-05)
1. [Summary](#1-summary)
2. [Research findings](#2-research-findings)
3. [Tool catalogue: the full list](#3-tool-catalogue-the-full-list)
4. [Recommendations](#4-recommendations)
5. [Architecture](#5-architecture)
6. [Cross-cutting rules: policy, privacy, offline, language, accessibility](#6-cross-cutting-rules)
7. [MIS backend changes](#7-mis-backend-changes)
8. [Roadmap: phases and tasks](#8-roadmap-phases-and-tasks)
9. [Testing](#9-testing)
10. [Risks](#10-risks)
11. [Decisions (accepted) and remaining open items](#11-decisions)
12. [Appendix: tool specifications](#12-appendix-tool-specifications)
13. [Sources](#13-sources)

---

## 0. What changed in v3 (2026-10-05)

Leadership accepted every recommendation in v2, with three changes. This version builds them in.

| Topic | v2 said | v3 decision | Where |
|---|---|---|---|
| **AI budget** | A small paid budget (D3) | **No budget.** Add more free AI providers to raise daily capacity, keep tutor control, and respect each provider's terms on minors. | §5.7 (new), Phase 3 |
| **Games** | 4–6 games, 30 min/day | A researched **brain-break games programme**: 15 easy v1 games (including the Rwandan **Igisoro**), 2 "reset" activities, a later set, and a **10-layer on/off control model** for admins and teachers. | §2.3, §6.7 (new), Phase 6 |
| **Translation review** | One language teacher per language | **Anyone with the `TOOLS_TRANSLATIONS_MANAGE` permission** can review and publish translations. By default only admins have it. | §6.3, Phases 2 and 7 |
| Student AI (D1) | Staff first, then students | Accepted | §11 |
| Open items O1–O4 | Questions to the owner | **O1 no GPU · O2 no Google Workspace / Microsoft 365 · O3 later · O4 the super admin validates Igisoro.** So: **no school AI server**, no Gemini-for-Education link, and student AI uses **free cloud providers only** | §5.7, §11.2 |
| Age 13+ (D2), analytics (D6), 180-day retention (D7), Desmos/GeoGebra (D8), parents (D9) | Recommendations | Accepted | §11 |

**New findings from the v3 research that change the build**

1. **Provider terms on minors (critical).**
   - The **Gemini API** terms forbid use in any service "likely to be accessed by individuals under the age of 18". This applies on the paid tier too.
   - **Groq** and **OpenRouter** (from 1 Sep 2026) also say 18+. It is unclear whether this covers the end users of an app built on them.

   So **student traffic must not go to these providers.** Students go to an *age-clean* pool:
   - Mistral, with parental consent;
   - Cloudflare Workers AI;
   - Z.ai GLM;
   - a school-hosted open model.

   Staff traffic can use everything. This also affects a live feature: MIS's learner-facing course tutor (`POST /elearning/my/courses/:id/ask`) uses the default order, which starts with Gemini. Phase 3 fixes this (task 3.0).
2. **Several free tiers ended in 2026.**
   - Cerebras: no longer free.
   - GitHub Models: retired 30 Jul 2026.
   - Chutes: free tier ended.
   - Mistral: now $10/month of free credit.

   The registry must expect free tiers to change and stay multi-provider.
3. **Small models leak answers.** In tests where a student pushes for the answer, 7–8B models gave away the final answer 40–75% of the time. A *second "leak-check" pass* cut this to about 4%. Tutor mode therefore uses strong models plus a leak checker.
4. **Games: names and looks matter legally.**
   - Tetris won a look-and-feel case.
   - NYT took down Wordle clones over the name and look.
   - "Connect Four", "Mastermind", "Scrabble" and "Boggle" are trademarks.

   We use generic names and original art (§6.7.4).

---

## 1. Summary

1. **What we build.** A **Tools** button in the title bar (next to the app tabs) opens a **Tools panel**. A tool can run in three places:
   - **inside the panel**, beside the current app;
   - in a **pop-out window**, which can stay on top or go full screen on a projector;
   - **full page**, for the whiteboard and games.

   Every tool is also listed in the ⌘K palette. An optional global shortcut opens the calculator and the timer from anywhere.
2. **What goes in it.** There are 34 candidate tools in six groups: Everyday, AI, Classroom (teachers), Study (students), Games, and Office (staff/admin). §3 lists them all. §4 recommends **26 for v1**, in priority order. One of them is a pack of 15 brain-break games (§6.7).
3. **Why these tools.** The research (§2) points to three things:
   - **Practice testing and spaced practice** are the study methods with the strongest evidence. This makes flashcards and quizzes the most valuable student tools.
   - **Teachers use simple classroom widgets the most:** timers, name pickers, noise meters and polls. These are best when they read the real class list, which NGA already has in MIS.
   - **An AI assistant that just gives answers harms learning.** In one study, students did 17% worse once access was removed. A tutor that guides students instead of answering for them removed most of that harm. So the student AI mode must be a **tutor that guides**, not an answer machine.
4. **Offline first.** About a third of Rwanda's schools (and most rural ones) had no connection in late 2024. All tools except AI, sync and the calendar refresh must work with no internet.
5. **Safe by design.** One **policy** decides when games and AI are available. It is computed by MIS from the timetable, active exams and admin settings, and the desktop caches it for offline use. Games are off during lessons and exams. AI is off during exams, and student AI runs in tutor mode.
6. **Licences checked.** Every library used is permissive (MIT, Apache-2.0 or BSD). Six licence traps are listed in §4.4: tldraw, Desmos, GeoGebra, CC BY-SA periodic-table data, FullCalendar Premium, and GPL chess and typing code. Game naming and look traps are in §6.7.4.
7. **AI at $0.** The registry grows from 6 to **11 provider entries**, routed by **audience**:
   - **Students** use only providers whose terms allow minors.
   - **Staff** can use every provider.
   - Every student tutor reply is **leak-checked** before it is shown.

   Estimated free capacity: about **700–1,500 student tutor turns a day**, all from free cloud tiers. Fair-share caps (about **3–5 tutor questions per student per day**) keep this fair (§5.7). Paid ways to raise capacity later are listed in §11.3.
8. **Phases.** These are covered in §8.
   - **Phase 0:** foundations.
   - **Phase 1:** everyday offline tools, shippable on their own.
   - **Phase 2:** identity, the calendar, and the translation workspace.
   - **Phase 3:** the AI assistant and the free-provider expansion.
   - **Phase 4:** classroom kit.
   - **Phase 5:** study kit.
   - **Phase 6:** games with guardrails.
   - **Phase 7:** office tools and the admin console.
   - **Phase 8:** hardening for v1.0 of the Tools Hub.

---

## 2. Research findings

### 2.1 What teachers use

- **ClassroomScreen** is the reference product for in-class tools. It has about 25 widgets, and the most used are:
  - timer
  - random name picker
  - noise-level meter
  - traffic light (a work-mode signal)
  - text / drawing
  - polls

  The noise meter helps students keep their own volume down. The name picker makes selection fair and keeps everyone engaged.
- **A survey of 500+ teachers (WeAreTeachers)** found:
  - Google Forms is the favourite assessment tool, followed by Kahoot and Edpuzzle.
  - Google Classroom and Calendar are the favourites for productivity.

  In short, **quick quizzes, polls and the calendar matter more than novelty widgets.**
- **Name pickers, group makers and seating plans** (Wheel of Names, Keamk, Mega Seating Plan) are worth most when they **sync the real class list**. Mega Seating Plan, for example, syncs with Teams and Google Classroom.
  - NGA advantage: MIS already knows every teacher's classes (`/calendar/my-class-groups`).
- **Microsoft Learning Accelerators** (Immersive Reader, Reading Coach) show demand for reading-support tools: read-aloud, line focus and text spacing.

### 2.2 What helps students learn (evidence)

| Finding | Source | What it means for us |
|---|---|---|
| Of 10 study techniques, only **practice testing** and **distributed (spaced) practice** rated "high utility". Highlighting and re-reading rated low. | Dunlosky et al., 2013 | Flashcards and self-quizzes are the top student tools. |
| A week later, students who practised recall kept 61% of a text, against 40% for students who re-read it. | Roediger & Karpicke, 2006 | The quiz tool should make students *recall*, not re-read. |
| The best gap between study sessions grows as the time until the test grows. | Cepeda et al., 2006 (meta-analysis, 317 experiments) | Use an FSRS scheduler. MIS e-learning already uses FSRS. |
| Pomodoro: mixed evidence. One 2025 study (n=94) found no overall advantage over breaks students chose themselves. | Smits et al., 2025 | Present the focus timer as a **focus aid with adjustable intervals**, not as a proven grade booster. |
| A plain chatbot raised practice scores by 48%, but later test scores fell by **17%** once it was taken away. A tutor version with safeguards removed most of that harm. | Bastani et al., PNAS 2025 (~1,000 high-school students) | Student AI must **guide, not answer** (§5.6). |

### 2.3 Games

- **Digital games beat comparable non-game teaching by d=0.33,** and better-designed games added a further d=0.34 (Clark et al., 2016). Design matters more than the medium.
- **Gamification has small positive effects.** Only the effect on knowledge held up in the more rigorous studies (Sailer & Homner, 2020).
- **Game-based science learning** has a mean effect of 0.667, larger in secondary schools than in primary.
- **Distraction is real.** UNESCO's GEM Report 2023 found that simply having a device nearby hurt learning in 14 countries.

  Our approach:
  - games are **off during timetabled lessons and exams**;
  - play time has a **daily budget**;
  - curriculum-linked games come first;
  - there are **no public leaderboards by default**.

**Brain breaks (v3 research)**

| Finding | Source | What it means for us |
|---|---|---|
| Breaks of **≤ 10 min** raised vigour (d=.36) and lowered fatigue (d=.35). The effect on overall performance was small and significant only for easy tasks. Recovering from hard work may need longer breaks. | Albulescu et al. 2022, meta-analysis (22 samples, N=2,335) | Game sessions are **5–10 minutes**. Breaks support wellbeing; they don't make students learn faster. |
| A **5-minute casual game** after a tiring task restored mood and engagement better than guided relaxation. Plain rest did not. | Rupp et al. 2017, *Human Factors* | Short, easy, finishable games are the right type. |
| Casual games lowered tension and fatigue in a 6-month RCT. | Russoniello et al. (ECU; industry-funded, so treat with caution) | Relaxing puzzle games are a good fit. |
| **Physical activity breaks** have the strongest evidence for ages 4–18: better on-task behaviour and executive function. | Systematic reviews (PMC 2025; CDC Community Guide) | Offer a **"Stand & stretch" reset card** next to the games, and nudge students to move after 10 minutes. |
| Gaming disorder (WHO ICD-11) means lost control and gaming taking priority over other things. It affects only a small share of players. The AAP sets no fixed hour limit for teens; media should not push out sleep, activity or face-to-face time. | WHO FAQ; AAP | Use time budgets and natural stopping points. **No streaks, loot, ads or "come back" nudges** (UK ICO Children's Code, standard 13). |
| Almost all break and casual-game studies are on **adults**. We found no strong RCT on teenagers' screen game breaks. | — | Pilot first and measure; tune the defaults with teachers. |

### 2.4 Staff and admin needs

- **Microsoft Lens stopped taking new scans on 15 Dec 2025.** A built-in **document scanner + OCR + PDF tools** fills a real gap for office staff.
- Other common staff needs:
  - date and working-day calculations for deadlines, leave and terms;
  - quick notes;
  - screenshots with annotation;
  - QR codes for posters and links.

### 2.5 AI in schools

- **UNESCO's Guidance for Generative AI in Education (2023)** recommends:
  - considering a **minimum age of 13** for classroom use (many experts argue for 16);
  - protecting data privacy;
  - having institutions validate AI tools before students use them;
  - training teachers.
- **Rwanda's National AI Policy (April 2023)** has an AI-literacy pillar. We found no REB or MINEDUC guidance specific to generative AI in schools (see §11).
- **Khanmigo** shows the patterns to copy:
  - it asks questions instead of giving answers;
  - it monitors every student chat;
  - flagged chats go to the teacher, and high-severity ones go to designated admins.
- **MagicSchool** shows what teachers want from AI: lesson plans, rubrics, quiz items and differentiation, plus a separate student space that teachers can see into.

### 2.6 Context: connectivity, language and accessibility

- **Connectivity.** About 62% of Rwandan schools were connected by late 2024. In rural areas the figure was only about 27%. So the design has to be **offline-first**.
- **Languages.** The UI should be in **EN / FR / RW** from day one.
  - Kinyarwanda machine translation exists online (Google Translate, since 2020).
  - The standard Tesseract OCR models include `eng`, `fra` and `swa`, but **no Kinyarwanda model**. Kinyarwanda text will still OCR with the Latin-script model, at lower accuracy.
- **Accessibility (WCAG 2.2).** Requirements:
  - buttons at least 24×24 px (the calculator keys and game tiles must exceed this);
  - focus never hidden;
  - full keyboard use;
  - a text label alongside every colour signal (noise meter, traffic light);
  - a projector-friendly high-contrast mode;
  - respect for "reduce motion".

---

## 3. Tool catalogue: the full list

**Who:**
- **S** = student
- **T** = teacher (teaching staff)
- **St** = support staff
- **A** = school admin / leadership
- **P** = parent

**Net:**
- **●** = fully offline
- **◐** = offline with optional online extras
- **○** = needs internet

**Effort:** S ≤ 3 days · M ≈ 1 week · L ≈ 2+ weeks (one developer).

| # | Tool | Group | Who | Net | Effort | v1? | Main library |
|---|---|---|---|---|---|---|---|
| 1 | **Calculator** (basic + scientific, history, fractions, units in expressions) | Everyday | All | ● | M | ✅ P1 | mathjs (Apache-2.0), KaTeX (MIT) |
| 2 | **Unit & currency converter** (RWF rates online, cached) | Everyday | All | ◐ | S | ✅ P1 | mathjs units |
| 3 | **Timer, stopwatch, countdown** (several at once, pop-out, projector mode) | Everyday | All | ● | M | ✅ P1 | Rust `timers.rs` |
| 4 | **Focus timer** (Pomodoro-style, adjustable; turns on desktop Do Not Disturb) | Everyday | S, T, St | ● | S | ✅ P1 | reuses #3 + `notifications.rs` DND |
| 5 | **Quick notes** (Markdown, search, pin, export) | Everyday | All | ● | M | ✅ P1 | SQLite, KaTeX |
| 6 | **Date calculator** (difference, add days, **school working days**, Rwanda holidays) | Everyday | All | ● | S | ✅ P1 | date-fns (MIT) |
| 7 | **QR code generator** (link / text / Wi-Fi; PNG/SVG export) | Everyday | T, St, A | ● | S | ✅ P1 | qrcode (MIT) |
| 8 | **My Day / calendar** (lessons, reminders, office hours, events; week view) | Everyday | All | ◐ | M | ✅ P2 | MIS `/reminders/agenda`, `/calendar/my-calendar` |
| 9 | **Event countdowns** ("Exams start in 12 days", "Break in 25 min") | Everyday | All | ◐ | S | ✅ P2 | reuses #8 + #3 |
| 10 | **AI Assistant**: modes Tutor (S), Teacher, Staff, Parent | AI | All (age-gated) | ○ | L | ✅ P3 | MIS aiProviders (6 providers) |
| 11 | **AI quick actions** on selected text (explain, simplify, translate EN/FR/RW, summarise) | AI | All | ○ | S | ✅ P3 | reuses #10 |
| 12 | **Random name picker** (from MIS class list; no repeats until everyone is picked) | Classroom | T | ◐ | S | ✅ P4 | MIS roster |
| 13 | **Group maker** (random / balanced; size or count; copy or project) | Classroom | T | ◐ | S | ✅ P4 | MIS roster |
| 14 | **Noise meter** (mic level only, nothing recorded) | Classroom | T | ● | S | ✅ P4 | Web Audio API |
| 15 | **Traffic light / work-mode sign** (silent, whisper, group work) | Classroom | T | ● | S | ✅ P4 | — |
| 16 | **Whiteboard** (draw, shapes, KaTeX maths, export PNG/PDF) | Classroom | T, S | ● | M | ✅ P4 | Excalidraw (MIT) |
| 17 | **Present mode**: show any tool full screen on the second display | Classroom | T | ● | S | ✅ P4 | Tauri multi-window |
| 18 | **Grade calculator** (weighted averages, % to CBC grade band) | Classroom | T, S | ● | S | ✅ P4 | — |
| 19 | **Seating chart** (drag students; save per class) | Classroom | T | ◐ | M | later | MIS roster |
| 20 | **Quick poll / exit ticket** (students answer from their own desktop) | Classroom | T, S | ○ | L | later | needs realtime (Tupo socket?) |
| 21 | **Graphing calculator** (functions, sliders, intersections) | Study | S, T | ● | M | ✅ P5 | function-plot / JSXGraph (MIT) |
| 22 | **Periodic table** (properties, filters, molar-mass calculator) | Study | S, T | ● | M | ✅ P5 | PubChem data (see §4.4) |
| 23 | **Formula sheets** (per CBC subject and level, KaTeX, searchable) | Study | S, T | ● | M | ✅ P5 | KaTeX; content in MIS |
| 24 | **Flashcards** (spaced repetition, decks from MIS/e-learning, AI-made decks) | Study | S | ◐ | L | ✅ P5 | ts-fsrs (MIT) |
| 25 | **Study planner** (exam countdowns, revision sessions, links to the focus timer) | Study | S | ◐ | M | later | reuses #8, #4, #24 |
| 26 | **Dictionary / glossary** (CBC subject terms EN/FR/RW offline; AI online) | Study | S, T | ◐ | M | later | curated JSON + #11 |
| 27 | **Typing tutor** (lessons + speed test) | Study / Games | S | ● | M | ✅ P6 | custom (avoid GPL Monkeytype) |
| 28 | **Brain-break games pack (v1)**: 15 easy games, incl. the Rwandan **Igisoro**, plus 2 reset activities (§6.7.2) | Games | S, T, St | ● | L | ✅ P6 | Simon Tatham puzzles (MIT, WASM), sudoku.js (MIT), 2048 (MIT), own code |
| 29 | **Games later set**: Chess, Checkers, Patience, Tile Match, Mini Crossword, Make 24, Keen, Dots & Boxes, Igisoro computer opponent (§6.7.3) | Games | S, T, St | ● | M each | later | chess.js (BSD-2), react-chessboard (MIT), CC0/public-domain art |
| 30 | **Coding puzzles** (Blockly Games: Maze, Bird, Turtle…) | Games | S | ● | M | later | blockly-games (Apache-2.0), offline pack |
| 31 | **Teacher game packs**: teachers make word-search, five-letter-guess and crossword packs from CBC vocabulary | Games | T → S | ◐ | M | later | own code + MIS `tool_content` |
| 32 | **Quiz battle** (practice questions from the Task Mentor bank) | Games | S | ○ | L | later | TM question bank API |
| 33 | **PDF tools** (merge, split, rotate, reorder, compress, watermark) | Office | St, A, T | ● | M | ✅ P7 | pdf-lib (MIT), pdfjs-dist (Apache-2.0) |
| 34 | **Scanner + OCR** (webcam or image to cleaned PDF, searchable text) | Office | St, A, T | ● | L | ✅ P7 | jscanify (MIT), tesseract.js (Apache-2.0) |
| — | *Considered and rejected:* clipboard history (privacy on shared lab PCs), screen annotation over other apps (needs click-through native overlay, high risk), citation generator (low value at secondary level) | | | | | ✗ | |

---

## 4. Recommendations

### 4.1 What to build first, and why

1. **The everyday offline set (Phase 1):** calculator, timers, focus timer, notes, date calculator and QR.
   - Everyone uses these daily, and they need no backend work.
   - They make the Tools Hub worth opening from week one.
2. **Calendar and identity (Phase 2).** The calendar ("My Day") is the reason to keep the desktop open. Identity unlocks everything role-specific that comes after it.
3. **The AI assistant (Phase 3).** This is the most-requested feature. It must ship with tutor mode, the exam lock and logging from day one, never as a "v2 safety pass" (§2.2, §2.5).
   - With no budget, capacity comes from **many free providers routed by audience** (§5.7).
   - The leak checker and per-person caps are part of the first release, not extras.
4. **The classroom kit (Phase 4).** Teachers project their screen in nearly every lesson. Roster-aware pickers and groups are something no generic website can match.
5. **The study kit (Phase 5).** Flashcards plus spaced repetition is the best-evidenced student tool. Share FSRS with MIS e-learning; don't build a second scheduler.
6. **Games (Phase 6)** come *after* the policy engine exists. Ship the 15-game brain-break pack (§6.7) with:
   - the full on/off control model;
   - 5–10-minute sessions;
   - break-time windows;
   - teacher-opened "class game time".
7. **Office tools (Phase 7):** a scanner, OCR and PDF tools, to fill the gap Microsoft Lens left.

### 4.2 Design rules we recommend

- **Each tool is a small, lazily loaded module.** Opening the hub must not slow the start-up of the four apps. Keep each installer under **+6 MB** in total; heavy assets ship as downloadable packs (§6.4).
- **Role decides what is visible; policy decides what is allowed now.** Never hide a tool without saying why. Show "Games are paused during lessons — back at 10:40" instead.
- **Students' data is theirs.** Notes, flashcards and focus history stay on the device, stored **per MIS user** and locked on sign-out (shared lab PCs, §6.2). Only AI conversations are stored on the server, and only because safeguarding requires it. Say so in the UI.
- **Teachers project their screen.** Every classroom tool has a large, high-contrast "Present" view.
- **Kinyarwanda is a first-class language,** not a later translation.

### 4.3 What not to build (or not yet)

| Idea | Why not now |
|---|---|
| Open, general-purpose chatbot for students | The evidence shows it harms learning (§2.2). Use tutor mode. |
| Clipboard history | Lab PCs are shared, so one student's clipboard would leak to the next. Tauri's clipboard plugin has no history feature anyway. |
| Drawing over other apps (screen annotation) | Needs a native transparent click-through window over WebView2/WKWebView. High risk on both OSes. Revisit after v1. |
| Live polls / exit tickets | Needs realtime infrastructure plus classroom pairing. Better done inside Task Mentor or Tupo. |
| Social leaderboards for games | Research and UNESCO concerns about distraction and pressure. Use personal bests only. |

### 4.4 Licence traps (verified 2026-10-05)

| Library / data | Trap | Our choice |
|---|---|---|
| **tldraw** (whiteboard) | Production use needs a paid licence key. The free "hobby" licence forces a "made with tldraw" watermark. | **Excalidraw (MIT)** |
| **Desmos API** (graphing) | Needs an API key. Commercial plans exist, and only Enterprise allows self-hosting (needed for offline use). Free use by a school is unclear. | **function-plot / JSXGraph (MIT)**. Desmos is offered only as an *online link*. |
| **GeoGebra** | Non-Commercial Licence. Bundling it in a distributed app is a grey area. | Link to geogebra.org online. Ask office@geogebra.org before embedding. |
| **Periodic-Table-JSON (Bowserinator)** | **CC BY-SA 3.0**: share-alike applies to the data we derive from it. | Build our dataset from **PubChem** (US government data), and credit the source. |
| **FullCalendar** | Core is MIT, but timeline and resource views are **paid Premium**. | Use only MIT core packages, or our own simple week grid. |
| **chessground, Stockfish(.js), Monkeytype** | **GPL-3.0**. Bundling them in the installer brings an obligation to publish our source. | chess.js (BSD-2) + react-chessboard (MIT). Our own typing tutor. |
| mathjs | Apache-2.0 (not MIT). Fine to use, but keep the NOTICE file. | Add it to `THIRD_PARTY_NOTICES.md`. |
| GNOME Sudoku/Mines, KSudoku, Aisleriot, SVG-cards | GPL / LGPL | Simon Tatham's collection (MIT), sudoku.js (MIT), public-domain card art (Byron Knoll) |
| French word lists: Lexique 3.83, wordfreq data | CC BY-SA 4.0 (share-alike) | Hunspell fr dictionaries (MPL-2.0) for checking words; a curated in-house list for answers |
| Kinyarwanda corpora (mbazaNLP, Digital Umuganda) | Licence unclear | Teachers build a curated in-house RW word list (owned by NGA) |
| Free AI API terms | Several forbid users under 18 or are trial-only (§5.7.2) | Audience routing (§5.7.3) |

---

## 5. Architecture

### 5.1 Where tools live in the shell today and tomorrow

Native app webviews always draw **above** the shell's HTML, so the shell can't simply float a widget over an app. We reuse the three placement patterns the shell already has:

| Surface | How it works | Reuses | Used for |
|---|---|---|---|
| **Panel** (default) | An `<aside>` beside `.viewport`. The app shrinks via `native.setInsets()` and stays usable. | `NoticePanel` (App.tsx `panel` state) | calculator, timers, notes, AI chat, converter, picker |
| **Pop-out window** | A separate Tauri `WebviewWindow` loading `index.html?tool=<id>`. Can be *always on top*, *full screen* or *on the second display*. | `overlay.rs` pattern (second shell window) | timer on top of a lesson, projector "Present" mode, calculator during homework |
| **Page** | Covers the app with `native.setCovered(true)`, like Settings. | `Settings` page | whiteboard, games, PDF/scanner, flashcard review |

```
┌──────────────────────────────── NGA window ────────────────────────────────┐
│ [MIS][Task Mentor][Tendo][Tupo]                  [🧰 Tools] [🔔] [☾] [⋯]   │  ← title bar
├───────────────────────────────────────────────────┬────────────────────────┤
│                                                   │ Tools ▾  🔍 search     │
│        active app (native webview,                │ ┌────────┐┌────────┐   │
│        shrunk by insets)                          │ │ Calc   ││ Timer  │   │
│                                                   │ ├────────┤├────────┤   │
│                                                   │ │ Notes  ││ AI ✦   │   │
│                                                   │ └────────┘└────────┘   │
│                                                   │ ── open tool ──        │
│                                                   │ [ 12 × (3 + 4) = 84 ]  │
│                                                   │ [↗ pop out] [⛶ present]│
└───────────────────────────────────────────────────┴────────────────────────┘
        pop-out window (always-on-top) ──►  ┌──────────┐
                                            │  04:59 ⏸ │
                                            └──────────┘
```

- **Panel width:** 360 px by default, resizable to 280–560, and remembered.
- **Panel exclusivity:** only one panel is open at a time. Change `panel: boolean` in `App.tsx` to `panel: false | "notices" | "tools"`.

### 5.2 Folder layout (new code)

```
src/
  tools/
    registry.ts          # all tool manifests (one array, typed)
    types.ts             # ToolManifest, ToolProps, ToolContext, Persona, Policy
    ToolsPanel.tsx       # grid + search + favourites + open tool
    ToolHost.tsx         # renders one tool in a surface (panel | window | page), error boundary
    ToolWindowApp.tsx    # entry for pop-out windows (index.html?tool=<id>)
    shared/
      i18n.ts            # tiny dictionary i18n: en / fr / rw
      useToolStore.ts    # per-user SQLite/KV access
      usePolicy.ts       # current policy (games/ai allowed, reason, until)
      usePersona.ts      # who is signed in (persona, capabilities)
      ui/                # BigButton, Display, PresentFrame, KeyPad…
    calculator/          # index.tsx, engine.ts, engine.test.ts, i18n.json
    timer/  notes/  converter/  date/  qr/  calendar/  assistant/
    classroom/{picker,groups,noise,traffic,whiteboard,grades}/
    study/{graph,periodic,formulas,flashcards}/
    games/{sudoku,g2048,g24,chess,words,typing,blockly}/
    office/{pdf,scanner}/
src-tauri/src/
  tools/
    mod.rs               # command registration + permissions
    timers.rs            # timers that keep running when the UI is closed; notify via notifications.rs
    windows.rs           # pop-out / present windows (create_later — see traps)
    api.rs               # authenticated MIS API client (reqwest), token held in Rust only
    policy.rs            # fetch + cache + evaluate policy offline
    packs.rs             # download optional asset packs (sha256-pinned)
    db.rs                # per-user SQLite path + migrations
```

### 5.3 The tool manifest (the single source of truth)

Every tool registers itself once. The panel, palette, search, permissions and policy all read this list.

```ts
// src/tools/types.ts
export type Persona = "student" | "teacher" | "staff" | "admin" | "parent";
export type Surface = "panel" | "window" | "page";

export interface ToolManifest {
  id: string;                          // "calculator", "timer", "sudoku" … (stable; used in settings & analytics)
  group: "everyday" | "ai" | "classroom" | "study" | "games" | "office";
  title: I18nKey;                      // "tools.calculator.title"
  icon: LucideIcon;
  keywords: string[];                  // palette search: ["calc", "math", "kubara"]
  audiences: Persona[] | "all";
  capability?: string;                 // optional MIS capability, e.g. "TOOLS_AI_ASSISTANT_USE"
  network: "offline" | "partial" | "online";
  surfaces: Surface[];                 // allowed surfaces; first = default
  policyClass?: "game" | "ai";         // subject to lesson/exam lock + budgets
  minAge?: number;                     // AI = 13 (see §11)
  pack?: string;                       // optional download pack (e.g. "ocr-eng-fra")
  load: () => Promise<{ default: React.ComponentType<ToolProps> }>;  // lazy
}

export interface ToolProps {
  surface: Surface;
  ctx: ToolContext;                    // persona, userId, lang, theme, online, policy, store, notify()
}
```

**Rule for developers: adding a tool**
1. Create its folder.
2. Add one manifest entry.
3. Add its i18n keys.
4. Add a unit test.

Nothing else in the shell changes.

### 5.4 Identity: how the shell learns who is signed in

The desktop shell doesn't hold a token today. It only knows "MIS signed in: yes/no" (`auth.rs`). Its CSP allows only the four app origins, and it has no HTTP client. The tools need the persona, user ID, capabilities and API access.

**Chosen design: a short-lived, narrow-scope *tools token*, held in Rust only.**

```
MIS webview (signed in)                     Rust shell                         MIS API
  bridge.js sees MIS signed in  ─────────►  auth.rs "MIS signed in"
                                            api.rs: ask MIS webview to mint ──► POST /auth/desktop-tools-token
  (eval in MIS webview, uses its own                                            (uses the MIS session; returns JWT
   session cookie/Bearer)            ◄────────────────────────────────────────  aud=nga-desktop-tools, 8 h, scopes)
  returns token via invoke(tools_token_set)
                                            keeps token in memory (+ OS keychain optional)
  React tools ── invoke("tools_api", {path}) ─► api.rs adds Bearer ────────────► /desktop/tools/*, /assistant/*, /calendar/*…
```

Why this design:
- The token never reaches JavaScript in the tool UI. Tool code calls `invoke("tools_api", …)`, and Rust adds the header. **The shell CSP doesn't change.**
- **Scopes are narrow.** The token works only on an allow-list of routes, enforced in a new MIS middleware `requireAudience("nga-desktop-tools")`. A stolen token can't change grades.
- **It follows sign-in.**
  - On "MIS signed out", or `auth::sign_out_everywhere`, Rust drops the token and locks the per-user tool data.
  - On the next sign-in it mints a new token.
- `GET /desktop/tools/me` returns `{userId, persona, presets, capabilities, ageBand, lang, classGroups[]}`, cached for offline start.

Alternatives we considered and rejected:
- **Bridge reads `localStorage.token`.** It exposes the full-power MIS token to more code.
- **Widen the CSP and use `fetch` from the shell.** It needs CORS changes and puts the token in JS.

### 5.5 Storage

| Data | Where | Why |
|---|---|---|
| UI prefs: favourites, panel width, last tool, language | `settings.json` (existing `tauri-plugin-store`), under a `tools` key | Already used by the shell. Not personal. |
| Personal data: notes, flashcards, timers, history, focus log | **SQLite per MIS user**: `<app data>/tools/<userId>.db` via `tauri-plugin-sql` (shell + tool windows only) | Offline, queryable, separated per user on shared PCs |
| Policy, profile, calendar cache | SQLite `cache` table with `fetched_at` | Offline start; shows "updated 2 h ago" |
| AI conversations | **MIS server** (§7) | Safeguarding review requires it |
| Heavy assets (OCR languages, Blockly Games, word lists) | `<app data>/packs/<name>/<ver>/`, downloaded on demand | Keeps the installer small |

**Migrations:**
- Each tool folder may ship `migrations/NNN_<tool>.sql`.
- `db.rs` runs them in order at open.
- Never edit a migration that has already shipped.

### 5.6 The AI assistant (design)

The assistant is a chat client in the shell that talks to a **new MIS endpoint**. All prompts, safety rules and provider choice stay **on the server**; the desktop never sends a system prompt.

**Modes are picked by persona; the user can't choose a stronger mode.**

| Mode | Who | Behaviour |
|---|---|---|
| **Tutor** | Students (13+, §11) | Asks guiding questions and gives hints step by step. **Never gives a full final answer to an assignment-shaped question.** Checks the student's attempt and explains mistakes. Grounded in CBC subject and level. Replies in the student's language (EN/FR/RW). |
| **Teacher** | Teaching staff | Drafts lesson plans, rubrics, quiz items, differentiation, feedback comments and parent letters. Links to the existing MIS lesson-plan and lesson-note AI. |
| **Staff** | Support staff, admin | Drafting, summarising, translating, formal letters, spreadsheet formulas. |
| **Parent** | Parents | Plain-language explanations of school topics and of how to support study at home. No grading of a child's work. |

**Guardrails, all server-side:**
1. **Exam lock.** While the policy says *exam in progress* (§6.1), `/assistant/chat` returns `423 Locked` with the reason and the end time.
2. **Lesson lock (students):** configurable. The default is to allow Tutor mode during lessons only if the teacher has enabled it.
3. **Moderation.** Every student message and reply passes a classifier on the `tutor-check` role (a student-safe provider, §5.7.3). Flagged items create an `assistant_flag` for the class teacher. Self-harm and abuse go straight to the safeguarding admins (Khanmigo pattern).
4. **Logging and transparency.**
   - Conversations are kept for 180 days (configurable).
   - Students are told clearly: "Your teacher and school safeguarding staff can see these chats."
   - Admin review uses the oversight pattern already in Tupo: a read/redact capability.
5. **Quotas.** Fair-share daily caps computed each morning from measured free capacity (§5.7.5). Typical caps: student 3–5 turns with cloud only (15–20 with a school AI server), teacher 40, staff 25, parent 5. These sit on top of the existing `limiter.ts`, which already keeps a daily reserve for `interactive` calls.
6. **Academic integrity.** Tutor answers carry a "Made with AI help" note. Teachers can see whether a student used the tutor on a topic (counts only, not the text) in a later phase.

**Server-side chat function.** The current entry point `generateStructuredContent()` returns JSON that must match a schema; it is not a chat function. Add `generateChat({messages, role: "interactive", feature: "desktop-assistant", actorUserId, stream})` to `services/aiProviders/`:
- **Streaming:** use SSE for providers that support it (OpenAI-compatible: OpenAI, Groq, DeepSeek, OpenRouter, GLM). Gemini uses its own stream API, or no stream.
- **Fallback:** keep the existing provider fallback on quota errors (402/429).
- **Logging:** log to `AIUsageLog` as today.

**Capacity.** No AI budget is available, so capacity, provider choice and tutor control are designed together in §5.7.

**Tutor-mode replies are not streamed.** A student's reply must pass the leak check (§5.7.4) before it is shown, so Tutor mode shows "Thinking…" and then the whole reply. Teacher, Staff and Parent modes stream.

### 5.7 AI at $0: free providers, audience routing and tutor control

#### 5.7.1 Goals

1. **$0 recurring cost.** Only free tiers, free credits and school-owned hardware.
2. **Respect every provider's terms.**
   - A student's message only goes to a provider whose terms allow minors.
   - Personal data never goes to a provider that trains on free-tier data.
3. **Tutor control holds on every provider.** Prompts are server-side, every reply is leak-checked, and providers are admitted to tutor traffic by evaluation (§5.7.4).
4. **Fair sharing.** Daily per-person caps are computed from the capacity actually available, so the morning classes don't use up the afternoon's quota.
5. **Survive change.** Free tiers changed five times in 2026. Every provider is a config entry that can be switched off in one env change, and the system degrades gracefully.

#### 5.7.2 Provider assessment (checked 2026-10-05)

**Assumption:** one tutor turn ≈ 2,000 input + 500 output tokens. On most free tiers, daily **token** caps bind before request caps.

**Who column:**
- **S+St** = students and staff
- **St** = staff only (18+ terms)
- **✗** = don't use

| Registry entry | Provider · model | Free limit (official unless noted) | ≈ turns/day | Trains on free data? | Who | Action |
|---|---|---|---|---|---|---|
| `glm` *(existing)* | Z.ai · **GLM-4.7-Flash** / 4.5-Flash | Listed "Free"; about 1 concurrent request (secondary source, **verify**) | hundreds (unverified) | No, unless you opt in | **S+St** | Keep. Add `glm-4.7-flash` as the first model. Set concurrency to 1 in `limiter.ts` |
| `mistral` *(new)* | Mistral · Small (tutor), Large (hard questions) | Free plan = **$10/month credit** | ~190 (Large) – ~500 (Small) | **Opt-out: turn training OFF** in Admin → Privacy | **S+St** (minors need parental consent → §5.7.6) | Add |
| `cloudflare` *(new)* | Cloudflare Workers AI · `qwen3-30b-a3b`, `glm-4.7-flash`, `gemma-4-26b-a4b`, `gpt-oss-120b` | **10,000 neurons/day** (one shared pool) | ~300–400 on small MoE models; ~100 on gpt-oss-120b | **No** | **S+St** | Add. Also used for the **leak checker** and moderation |
| `local` *(later)* | School AI server: llama.cpp `llama-server`, Qwen3-8B / Gemma-class | Hardware-bound | GPU: ~3,000–6,000 · CPU: ~250–400 (estimates) | Never leaves our control | S+St | **Not in this build:** no GPU (O1 = no). One small env entry through the same factory when hardware exists (§11.3) |
| `sambanova` *(new)* | SambaNova Cloud · gpt-oss-120b, DeepSeek-V3.x, Llama-3.3-70B | **20 RPD, 200K TPD per model** | ~100 (5 models) | **Terms not yet checked** | **St** until checked | Add, staff-only |
| `groq` *(existing)* | Groq · gpt-oss-20b | 1K RPD, **200K TPD** per model | ~80 | No | **St** (18+) | Keep, staff-only |
| `groq-120b` *(new entry, same key)* | Groq · **gpt-oss-120b** | separate per-model quota | ~80 | No | **St** | Add (best free staff model) |
| `gemini` *(existing)* | Google AI Studio · **Flash-Lite** (3.1/3.5) | Per-project, shown in AI Studio (~500 RPD for Flash-Lite in Apr 2026; **verify**) | hundreds | **Yes, and humans may read it** | **St** only, **no PII** | Keep. Switch the default model from 2.5 Flash (20 RPD) to Flash-Lite |
| `gemma` *(new entry, same key)* | Google AI Studio · **Gemma 4** | separate quota (Gemma 3 was 14,400 RPD / 15K TPM; **verify**) | hundreds (TPM-bound) | **Yes** | **St**, **no PII** | Add |
| `openrouter` *(existing)* | OpenRouter `:free` models | 50 RPD per account | 50 | Depends on the upstream provider | **St** (18+ since 1 Sep 2026) | Keep, staff-only, last resort |
| `openai`, `deepseek` *(existing)* | — | paid / zero balance | 0 | — | — | Leave out of the default orders (as today) |
| — | Cerebras | No free tier any more | 0 | — | ✗ | Don't add |
| — | GitHub Models | **Retired 30 Jul 2026** | 0 | — | ✗ | Don't add |
| — | NVIDIA build.nvidia.com | "internal testing and evaluation… **not in production**" | — | — | ✗ | Don't add (terms) |
| — | Cohere trial key | 1,000 calls/month, **not for production** | — | — | ✗ | Don't add (terms) |
| — | Together, Chutes, Fireworks, Nebius, Hyperbolic, Novita | No free tier, or one-off cents | ~0 | — | ✗ | Don't add |
| — | Alibaba Qwen (intl) | 1M tokens, expires after 90 days, **turns into paid billing automatically** | — | — | ✗ | Don't add (risk of charges) |
| — | Hugging Face, OVH anonymous, LLM7, Pollinations | $0.10/month · 2 RPM per school IP · unverified quotas | ~0–40 | — | ✗ | Don't add |

**Result:** 6 registry entries become **11** (5 new: `mistral`, `cloudflare`, `sambanova`, `groq-120b`, `gemma`). `local` is added later, with hardware.

**Don't multiply free accounts.** Never create several accounts with one provider to stack free quotas. It breaks every provider's terms and risks a ban on the account the school depends on. One account per provider, owned by the school's IT address.

**Outside our API (checked with the owner, 2026-10-05):**
- **Google Workspace for Education** (free Gemini app and NotebookLM for all ages) and **Microsoft 365 Copilot Chat (13+)** are **not available**: NGA uses neither (O2 = no). Revisit if the school ever joins Workspace for Education Fundamentals, which is free for qualifying schools.
- **Anthropic × Government of Rwanda MOU (Feb 2026):** 2,000 Claude Pro licences for Rwandan educators. **Later (O3).** It would take teachers' heavy use out of the free pool.

#### 5.7.3 Audience routing (what the registry change looks like)

Every AI call gets an **audience**, decided on the server and never by the client:
- `minor`: any STUDENT persona, or anyone whose age band is under 18;
- `adult`: everyone else.

Each provider declares what its terms allow:

```ts
// services/aiProviders/types.ts (additions)
export type AIAudience = "minor" | "adult";
export interface AIProviderTerms {
  allowsMinors: boolean;      // terms permit end users under 18 (with our consent flow where required)
  trainsOnFreeData: boolean;  // prompts may be used for training / human review → PII must be stripped
}
export interface AIProvider { /* …existing… */ terms: AIProviderTerms; chat?(p: ChatParams): AsyncIterable<ChatChunk> | Promise<ChatResult>; }

// services/aiProviders/openaiCompatible.ts — one factory for all OpenAI-style vendors (new + future)
export function openaiCompatibleProvider(cfg: {
  name: string; baseURL: string; keyEnv: string; modelEnv: string; defaultModels: string[];
  terms: AIProviderTerms; extraHeaders?: Record<string, string>;
}): AIProvider
```

- **Routing.** `orderedProviders(order, { audience })` drops every provider where `audience === "minor" && !terms.allowsMinors`. This is enforced in **one place**, and a unit test checks every role order against it.
- **Admin override.** `AI_MINOR_SAFE_PROVIDERS` (env) can *remove* providers from the minor list, for example if a vendor changes its terms. Adding one requires a code change with a terms review in the PR.
- **New roles:**

  | Role | Audience | Default order |
  |---|---|---|
  | `tutor` | minor | `mistral, cloudflare, glm` (`local` goes first once it exists) |
  | `tutor-check` (leak checker + moderation) | minor | `cloudflare, glm` |
  | `assistant` (Teacher/Staff/Parent chat) | adult | `groq-120b, gemini, gemma, groq, sambanova, glm, mistral, cloudflare, openrouter` |

  The existing roles (`draft`, `assess`, `verify`, `repair`, `interactive`) keep their orders for staff features. The learner course tutor moves to `tutor` (task 3.0).
- **PII scrubber** (`piiScrubber.ts`) runs on every request to a provider with `trainsOnFreeData: true`, and on all `minor` traffic:
  - names from the MIS directory become "the student" / "the teacher";
  - emails, phone numbers and student IDs are removed;
  - unit-tested.
- **Other apps.** Task Mentor, Tendo and Tupo have their own copies of the registry. Their AI features are staff-facing today, but audit them during Phase 3. Any feature a student can reach must use audience routing too (task 3.12).

#### 5.7.4 Tutor control on free models (the pipeline)

The research shows that weaker models leak answers, so control is a **pipeline**, not just a prompt:

```
student message
  │ 1. gate: policy (exam/lesson lock) · per-person cap · age gate          → 423 / 429 with reason
  │ 2. input moderation (tutor-check role, Llama-Guard-class model)       → flag + safe reply if unsafe
  │ 3. build context: mode prompt (server, versioned) + subject/level + CBC snippet
  │    + last 6 turns + rolling summary  (keep input ≤ 1,500 tokens → more turns per free quota)
  │ 4. draft (tutor role) — model is told to plan silently: "what does the student know? next smallest hint?"
  │ 5. LEAK CHECK (tutor-check role): {gives_final_answer, does_the_work_for_student, unsafe} → JSON
  │      leak → regenerate once with stricter instruction → still leaking → safe template:
  │      "Let's do it together — what is the first step you would try?"
  │ 6. output moderation (same pass as 5)
  ▼ 7. send whole reply · log (conversation, provider, model, check verdicts) · count quota
```

- **Admission by evaluation.** `scripts/eval-tutor.mjs` runs about 80 prompts against each provider/model pair:
  - 40 homework-style prompts with an "adversarial student" who pushes for the answer;
  - 20 genuine concept questions;
  - 20 FR/RW prompts.

  A pair joins the `tutor` order only if it scores **≥ 90% no-leak on the draft alone**, **≥ 98% after the leak check**, and **≥ 85% helpfulness** (judged by `tutor-check` plus a 10% human spot check). Results are stored in `ai_provider_evals` and shown on the admin AI page. Rerun the evaluation monthly and whenever a model changes.
- **Language.** Open models are weak in Kinyarwanda (IrokoBench: Gemma 2 27B scores 42.8% on Kinyarwanda tasks). Tutor mode answers in **English or French by default**. If a student writes in Kinyarwanda, it replies in simple Kinyarwanda and adds the key terms in English, and it never invents vocabulary. Staff modes may use Gemini, which is stronger in Kinyarwanda.
- **Answer cache.** Concept explanations ("what is photosynthesis?") are not personal work, so they are cached per *(normalised question, subject, level, language)* for 7 days. This saves quota on the most common questions. Homework-shaped prompts are never cached.

#### 5.7.5 Capacity and fair sharing (free cloud only)

| Pool | Sources | ≈ turns/day |
|---|---|---|
| **Student-safe** | GLM + Mistral (free $10/month credit) + Cloudflare (10,000 neurons/day) | **~700–1,500** |
| **Staff** | Groq ×2, Gemini Flash-Lite, Gemma, SambaNova, OpenRouter (+ the student-safe providers when idle) | **~500–800** |

**Demand:** 300 students × 10 turns is 3,000 per day. **Free cloud capacity cannot serve unlimited tutoring**, so we share it fairly and make every turn count.

- **Fair-share caps, computed each morning (06:00 Kigali).**
  - Student daily cap = `floor(0.8 × yesterday's measured student-pool capacity ÷ active students)`, clamped to 2–20. Today that is about **3–5 tutor questions per student per day**.
  - Teacher 40, staff 25, parent 5 (admin-configurable).
  - Unused staff capacity flows to students after 14:00, and unused student capacity flows to staff after 18:00.
  - The MIS course tutor and the desktop tutor **share one student cap**, so a student can't double-spend.
- **Make each turn count (all free):**
  - **Answer cache:** common concept questions are answered from the cache (§5.7.4) and **don't use up the student's cap**.
  - **Short prompts:** ≤ 1,500 input tokens (last 6 turns + rolling summary). Token caps, not request caps, are what limit us.
  - **Offline helpers before AI:** the tutor box offers the formula sheets, glossary and flashcards for the topic. Many questions are answered without a call.
  - **Teacher-shared answers:** a teacher can pin a good tutor explanation to a class topic. Students read it for free, and it is cached.
- **Tell students what's left:** "You have 2 tutor questions left today — they refill tomorrow at 06:00."
- **No school AI server and no on-device AI in this build.**
  - The school has no GPU (O1).
  - A 1–3B on-device model is too weak for tutoring and leaks answers.
  - Both stay in §11.3 for when a budget or a donated machine appears.

#### 5.7.6 Consent and transparency

- **Mistral** requires parental or guardian consent for minors. Add a one-time **AI consent** to the parent portal in MIS: "My child may use the NGA AI Tutor". Students whose parents have not consented are routed only to `cloudflare` and `glm`.
- The AI tool shows **which provider answered** in a small "ⓘ" (e.g. "Answered by: school server"), and the first-run notice lists the providers.
- A **provider register** in MIS admin (AI page) shows for each provider:
  - its terms status (allowsMinors, trains on data);
  - the date the terms were last reviewed;
  - today's usage.

  **Review the terms every term (3× a year).**

---

## 6. Cross-cutting rules

### 6.1 One policy engine (games and AI)

MIS computes the policy because it owns the timetable, exams and admin settings. The desktop caches it and keeps evaluating it offline.

`GET /desktop/tools/policy` returns:

```jsonc
{
  "generatedAt": "2026-10-05T07:58:00Z",
  "validUntil":  "2026-10-05T15:00:00Z",
  "tools":   { "disabled": ["chess"] },                      // admin switched off
  "windows": [                                              // today's lock windows (Kigali time, sent in UTC)
    { "from": "08:00", "to": "09:40", "kind": "lesson", "label": "Physics S4" },
    { "from": "10:00", "to": "11:30", "kind": "exam",   "label": "Maths CAT" }
  ],
  "games":  {                                               // full control model: §6.7.5
    "enabled": true,                                        // layer 1: global switch
    "allowed": ["igisoro", "number-place", "pairs", "…"],   // layers 2–3: per game × audience, already resolved for this user
    "quietHours": ["21:30", "06:00"],                       // layer 4: schedule
    "dailyBudgetMin": 30, "usedTodayMin": 12,               // layer 5: budget (learning games count × 0.5)
    "sessionCapMin": 10, "cooldownMin": 5,
    "earnMinPerFocusSession": 5,
    "classGameTime": { "until": "2026-10-05T12:20:00Z", "games": ["make-24", "word-search"], "by": "Ms. Uwase" }, // layer 6
    "override": null                                        // layer 8: { "kind": "block"|"extend", "until", "reason", "extraMin" }
  },
  "ai":     { "mode": "tutor", "dailyMessages": 5, "usedToday": 4, "allowedInLessons": false, "consent": true },
  "exam":   { "active": false }                             // true → AI + games locked now
}
```

**Lock windows:**
- **Lessons:** come from the student's timetable (the shared "live lessons" rule in MIS).
- **Exams:** come from Task Mentor active quizzes or exams. TM pushes them to MIS through the existing Reminder Hub *Source API* (`PUT /reminders/sources`), so MIS already knows about them.

**Instant local signal.** If the Task Mentor webview is on a quiz-attempt page, the shell treats "exam active" as true at once, without waiting for the server. The URL pattern lives in `registry.rs`; confirm the path with the TM team.

**Offline:** use the cached `windows`. If the cache is older than 24 h, **fail closed for games** and **fail open for offline study tools.** AI needs the network anyway.

**UI:** a locked tool still shows in the grid, with a lock badge and a reason: *"Paused during Physics S4 — back at 09:40."*

### 6.2 Privacy on shared computers

- Per-user database files mean one student never sees another's notes.
- On sign-out, close the DB and close any tool windows. **Present mode closes too**, because it may show class lists.
- Signed out, the Tools panel offers **only** anonymous offline tools:
  - calculator
  - converter
  - timer
  - date calculator
  - QR generator
  - periodic table and formulas

  These keep nothing between sessions.
- The noise meter processes microphone levels on the device and **never records or sends audio**. Say so in the tool.
- No analytics include content. A tool open is counted as `{toolId, persona, surface}` only, sent to the existing platform usage analytics. This is optional; see D6.

### 6.3 Language

- `src/tools/shared/i18n.ts` is a small typed dictionary. The source is `en`, with `fr` and `rw` beside it in `src/tools/i18n/{en,fr,rw}.json`. No new framework is needed.
- The language follows the MIS profile language when known, and the OS language otherwise. It can be changed in Tools settings.
- **CI:**
  - It **fails** if a key used in code is missing from `en`.
  - A key missing from `fr` or `rw` is only a **warning**. At runtime it falls back to English and shows up as "missing" in the translation workspace.

#### 6.3.1 Translation review: anyone with the permission (default: admins)

**Permission.** A new capability, **`TOOLS_TRANSLATIONS_MANAGE`**.
- By default only the **admin** presets have it: `platform_owner` and `school_administrator`.
- Through RBAC v2 an admin can grant it to **any role or any person**, for example a Kinyarwanda teacher, a French teacher or a student language club leader.
- No other role has it by default.

**How it works:**

```
desktop repo (bundled en/fr/rw JSON) ──release CI──► MIS: register new/changed English keys (status "missing"/"outdated")
                                                          │
          Translation workspace (Tools → "Translations", visible only with TOOLS_TRANSLATIONS_MANAGE)
          edit · "Suggest with AI" · approve · publish  ──► MIS table tool_translations (+ audit)
                                                          │
every desktop ◄── GET /desktop/tools/i18n/:lang?since=<ver> (approved only, cached offline) ── overrides bundled strings
                                                          │
`npm run i18n:pull` before each release ◄─────────────────┘   (approved strings flow back into the repo JSON)
```

**Workspace features:**
- A list of every key: the English source, the current FR/RW text, and status badges (**missing · AI draft · draft · approved · outdated**). A key is *outdated* when its English text changed after it was translated (source hash mismatch).
- Filters by tool and by status, plus search.
- **In-context mode.** With translation mode on, Alt/⌥-click any text in any tool to open that key in the editor.
- **"Suggest with AI".** Uses the staff `assistant` pool, where Gemini is strongest in Kinyarwanda. A suggestion is saved as an **AI draft** and is never published until a person approves it.
- **Glossary.** Fixed terms, such as subject names and "Igisoro", so translations stay consistent.

**Approval and publishing:**
- Any holder of the permission can approve and publish.
- Optional setting, off by default: "require a second reviewer". When on, a holder cannot approve their own edit.
- Each **Publish** creates a numbered release.
- Desktops pick up the release within 5 minutes, or on the next start, with **no app update needed**.
- Rolling back to an earlier release takes one click.

**Audit and scope:**
- Every edit, approval and publish is recorded in the MIS audit log: who, when, old text and new text.
- The same permission covers the **FR/RW word packs for games** (§6.7), since those are also language content.

### 6.4 Offline packs (keep the installer small)

| Pack | Approx. size | Contains |
|---|---|---|
| `ocr-eng-fra-swa` | ~6–8 MB | Tesseract fast models (no Kinyarwanda model exists; the Latin model is used for RW) |
| `games` | ~3–6 MB *(measure)* | Simon Tatham WASM puzzles (Pattern, Bridges, Mines, Untangle, plus later ones), sounds, card and tile art |
| `wordlists` | ~2 MB | Curated EN/FR/RW word packs for games and spelling (NGA-owned, §6.6); updated without an app release |
| `blockly-games` *(later)* | ~10–15 MB *(measure)* | Offline Blockly Games build (Apache-2.0) |

Packs are served from `api.amashuri.com/desktop/packs/<name>/<ver>/` with a `pack.json` (sha256 per file). This follows the existing `/desktop/files` and one-line-installer pattern. `packs.rs` downloads, verifies the hash, unpacks and records the version.

### 6.5 Accessibility checklist (applies to every tool)

- Every action works by keyboard, with a visible focus ring that is never hidden.
- Click targets are at least 32 px (WCAG minimum 24 px). Present mode uses at least 64 px.
- Colour is never the only signal. The noise meter shows "Quiet / OK / Too loud" as text too.
- Respect `prefers-reduced-motion` (timer flash, 2048 animations).
- Use the existing theme tokens (light/dark follow the shell) plus a high-contrast Present palette.
- Screen-reader labels on all icon buttons; maths rendered with KaTeX includes MathML.

### 6.6 Kinyarwanda and French content ownership

All school-made content belongs to NGA and is reviewed by holders of `TOOLS_TRANSLATIONS_MANAGE` or by the subject owner:
- word lists for games;
- glossaries;
- formula-sheet text.

Don't import word lists with share-alike or unclear licences (§4.4).

### 6.7 Games programme: brain breaks with full control

#### 6.7.1 Principles (from §2.3)

1. **Short and finishable.** Every game reaches a natural end in **≤ 10 minutes**, and state saves on pause, so stopping costs nothing.
2. **Easy to start.** No tutorial longer than one screen, and no accounts or setup.
3. **A mix of refreshers:**
   - logic;
   - memory;
   - words (EN/FR/RW);
   - maths;
   - light reflex;
   - a 2-player game on one device, to play with a friend;
   - culture: **Igisoro**.
4. **Move as well as play.** A "Stand & Stretch" card is always beside the games. At the session cap, the student gets a stretch prompt instead of "play again".
5. **No manipulation (ICO Children's Code, standard 13):**
   - no ads, purchases, currencies or loot;
   - no daily streaks and no losing progress for missing a day;
   - no "come back" notifications;
   - no public leaderboards; personal bests only;
   - no timers in the default modes, except reflex games, where the timer *is* the game.
6. **Offline, no network.** Everything ships in the app or in the `games` pack.
7. **Generic names and original art** (§6.7.4).
8. **One shared daily puzzle.** The Number Place and Picture Logic puzzles use the same seed for the whole school each day. This gives students something to talk about at lunch, with no ranking.

#### 6.7.2 v1 catalogue: 15 games + 2 reset activities

| # | Game (name in app) | Category | Refreshes / trains | Session | Players | Build | Source & licence |
|---|---|---|---|---|---|---|---|
| G1 | **Igisoro** (Rwandan mancala, 4×8 pits, 64 seeds) | Culture · strategy | counting, planning | 10–20 min | 2 on one device | M–L | Own code. Rules from the Rwanda Cultural Heritage Academy; **ships off until the super admin approves the rules and variant** (rules vary by region). The computer opponent comes later |
| G2 | **Number Place** (sudoku; 4 levels, notes, limited hints) | Logic | deduction | 5–15 | 1 | S | sudoku.js (MIT) |
| G3 | **Picture Logic** (nonogram) | Logic | deduction, patterns | 5–10 | 1 | S | Simon Tatham *Pattern* (MIT, WASM) |
| G4 | **Bridges** | Logic | spatial reasoning | 3–10 | 1 | S | Tatham *Bridges* (MIT) |
| G5 | **Mines** | Logic | probability, deduction | 3–8 | 1 | S | Tatham *Mines* (MIT); no Microsoft art |
| G6 | **Untangle** | Relaxing logic | spatial | 2–5 | 1 | S | Tatham *Untangle* (MIT) |
| G7 | **Merge to 2048** | Puzzle | planning, powers of 2 | 3–8 | 1 | S | 2048 by G. Cirulli (MIT), own art and colours |
| G8 | **Pairs** (themed sets: elements ↔ symbols, EN ↔ RW words, countries ↔ capitals, or plain pictures) | Memory | working memory, vocabulary | 2–4 | 1–2 | S | Own code |
| G9 | **Echo** (repeat the growing sequence of colours and tones) | Memory | sequential memory | 2–3 | 1 | S | Own code (not "Simon") |
| G10 | **Five-Letter Guess** (EN / FR / RW) | Words | vocabulary, deduction | 3–5 | 1 | S | Own code; **own look**, not the Wordle grid or colours; shapes plus colour for colour-blind players; curated word packs (§6.6) |
| G11 | **Word Search** (curriculum vocabulary packs, EN/FR/RW) | Words | spelling, subject terms | 3–5 | 1 | S | Own code; packs come from teachers later (catalogue #31) |
| G12 | **Mental Math Sprint** (60 s rounds; levels S1–S6) | Maths | number fluency | 1–3 | 1 | S | Own code |
| G13 | **Code Breaker** (colour-code deduction, 4–6 pegs) | Logic | hypothesis testing | 3–5 | 1 | S | Own code (not "Mastermind") |
| G14 | **Four in a Row** (friend or simple computer) | Strategy | look-ahead | 3–5 | 1–2 | S | Own code (not "Connect Four") |
| G15 | **Snake** (gentle speed curve, no "game over" sting) | Reflex | focus, reaction | 2–3 | 1 | S | Own code |
| R1 | **Breathe** (1–2 min guided box breathing, animated) | Reset | calm | 1–2 | 1 | S | Own code. Doesn't count toward the budget |
| R2 | **Stand & Stretch** (6 illustrated 2-minute routines; ideas from Rwandan playground games for groups) | Reset | movement | 2 | 1+ | S | Own illustrations. Doesn't count toward the budget |

The **Typing tutor** (catalogue #27) sits in the Games group as a *learning* game.

**Learning tag** (counts × 0.5 toward the budget): G8 (themed sets), G10, G11, G12 and the typing tutor.

#### 6.7.3 Later set (after the v1 pilot)

- Chess (chess.js BSD-2 + react-chessboard MIT; **no Stockfish**)
- Checkers
- Patience (Klondike solitaire, public-domain Byron Knoll card art)
- Tile Match (mahjong solitaire, CC0 tiles; not "Shanghai")
- Mini Crossword (MIT layout generator)
- Make 24 (not "24 Game")
- Keen (KenKen-style, Tatham)
- Dots & Boxes
- More Tatham puzzles (Loopy, Light Up, Net, Flood, Same Game, Towers, Tents), each a cheap admin toggle once the wrapper exists
- **Igisoro computer opponent** (3 levels)
- **Ibisakuzo** riddles (Kinyarwanda; content written in-house)
- Blockly Games
- Teacher-made word packs

**Not planned:**
- falling-block games (the Tetris look-and-feel risk);
- a Scrabble-style board;
- real-time online multiplayer (moderation load, no offline play).

#### 6.7.4 Naming and look rules (IP)

Game *mechanics* aren't protected, but **names, art, colour schemes and overall look and feel can be.** For every game:

1. Use the generic name from the table.
2. Draw original art from NGA's design tokens.
3. Never copy the colour scheme or layout of the famous version.

Specific traps:
- Tetris (*Tetris v. Xio*, 2012, trade dress);
- Wordle (NYT takedowns over the name and the green/yellow/grey grid);
- Connect Four, Scrabble and Boggle (Hasbro/Mattel);
- Mastermind (registered trademark);
- Simon (Hasbro);
- 24 Game (Suntex);
- KenKen;
- Shanghai (Activision);
- Breakout (Atari) and Arkanoid (Taito).

#### 6.7.5 Control model: everything can be switched on and off

Rules are **deny-first**, and the most specific rule wins. The exam lock beats everything.

| Layer | What it controls | Who sets it | Default | Where it's enforced |
|---|---|---|---|---|
| 1 | **Global Games switch** | Admin (`TOOLS_GAMES_MANAGE`) | On | MIS policy + desktop |
| 2 | **Each game on/off** | Admin | All v1 games on, except **Igisoro**, which stays off until the super admin approves its rules | Policy `allowed` list |
| 3 | **Audience:** persona, grade (S1–S6), class, or a single person | Admin | Students + staff; parents off | Resolved in MIS → `allowed` |
| 4 | **Schedule:** allowed only outside lessons (automatic from the timetable), plus quiet hours, weekend and holiday rules | Admin | Allowed when the student has no lesson or exam; quiet hours 21:30–06:00 | Policy `windows`, `quietHours` |
| 5 | **Budgets:** daily minutes, session cap, cool-down; learning games weighted | Admin | 30 min/day · 10 min/session · 5 min cool-down · learning × 0.5 | Desktop timer (`games.rs`) + MIS reconcile |
| 6 | **Teacher "Class game time":** opens chosen games for one class for 5–30 min, even in their own lesson; ends automatically | Teacher of that class (`TOOLS_CLASSROOM_USE`) | Off | Policy `classGameTime`; doesn't count toward the budget |
| 7 | **Exam lock** | Automatic (TM exams, exam timetable) | Always on | Beats layers 1–6 |
| 8 | **Per-student override:** block (behaviour, parent request) or extend (special needs), with a reason and expiry | Class teacher, counsellor, admin | None | Policy `override`; audited |
| 9 | **Staff games:** outside their own teaching slots | Admin | On, no budget | Same engine, persona `staff` |
| 10 | **Reports:** minutes per class per week, most-played games | Admin, class teacher | Totals only | MIS admin "Desktop tools" page |

- **Individual detail.** A student's own minutes are visible to the student. The class teacher and counsellor see them only when considering an override. This keeps monitoring proportionate.
- **How the desktop counts time.** `games.rs` counts only while the game window is focused and visible, and pauses after 60 s idle. Usage is sent to MIS in batches (`POST /desktop/tools/games/usage`), queued when offline. MIS adds up the budget across devices, so changing PCs doesn't reset it.
- **What students see when a game is locked:**
  - "Games open again at 12:20 (lunch)."
  - "You've played 30 min today — try Stand & Stretch!"
  - "Paused for the Maths CAT."
  - **The game always saves first.**

#### 6.7.6 Game framework (code)

```
src/tools/games/
  GameShell.tsx        # common frame: pause/resume, save/restore, session timer, policy events, sound on/off, keyboard help
  types.ts             # GameModule { id, title, tags: ("learning"|"fun"|"reset")[], create(seed, opts) → GameInstance }
                       # GameInstance { mount(el), serialize(): string, pause(), resume(), destroy(), onFinish(cb) }
  seed.ts              # daily seed = hash(date in Africa/Kigali + gameId) → shared daily puzzle
  tatham/              # generic wrapper for Simon Tatham WASM puzzles (one wrapper → many games); assets in "games" pack
  igisoro/  number-place/  pairs/  echo/  five-letter/  word-search/  math-sprint/  code-breaker/  four-in-a-row/  snake/  merge-2048/
  reset/breathe/  reset/stretch/
src-tauri/src/tools/games.rs   # play-time accounting (focus/visibility/idle), budget + cool-down, usage queue → MIS
```

**Every game must:**
- save and restore exactly, with a round-trip test;
- be fully playable with the keyboard;
- respect reduced motion;
- have sound off by default in school hours;
- have no network calls (checked by a CI test that fails the build on `fetch` or `XMLHttpRequest` in `games/`).

---

## 7. MIS backend changes

These are small and grouped into one MIS PR per phase. Use the next free migration numbers. The migrations must be **applied by hand on prod** (see the production-server notes: `npm run migrate` doesn't work there).

| Phase | Change | Notes |
|---|---|---|
| P2 | `POST /auth/desktop-tools-token` | Called from the MIS webview with its own session. Signs a JWT `aud=nga-desktop-tools`, 8 h, with `sub`, persona and scopes. |
| P2 | `requireAudience()` middleware + route allow-list | The tools token is accepted **only** on `/desktop/tools/*`, `/assistant/*` and read-only `/calendar/my-calendar`, `/calendar/upcoming`, `/calendar/my-class-groups`, `/reminders/agenda`. |
| P2 | `GET /desktop/tools/me` | persona, presets, capabilities, age band (from date of birth, not the exact date), language, class groups |
| P2 | `GET /desktop/tools/policy` | §6.1. Reuses the live-lessons filter and the Reminder Hub sources for exams. |
| P2 | Capabilities in `access/manifest.ts` | `TOOLS_USE` (default for every persona), `TOOLS_AI_ASSISTANT_USE`, `TOOLS_AI_ASSISTANT_REVIEW`, `TOOLS_GAMES_PLAY`, `TOOLS_GAMES_MANAGE` (admin), `TOOLS_CLASSROOM_USE` (teaching staff), `TOOLS_ADMIN_MANAGE`, **`TOOLS_TRANSLATIONS_MANAGE`** (default: admin presets only, can be granted to any role or person) |
| P2 | Translations: tables `tool_translations` (key, lang, text, status, source_hash, edited_by, approved_by), `tool_translation_keys` (key, en_text, source_hash, tool), `tool_translation_releases`; `GET /desktop/tools/i18n/:lang?since=`, `GET/PUT /desktop/tools/i18n/keys`, `POST /desktop/tools/i18n/publish`, `POST /desktop/tools/i18n/sync` (CI, service token) | §6.3.1. Edits, approvals and publishes are audited |
| P3 | `services/aiProviders/generateChat.ts` | streaming chat + fallback (§5.6) |
| P3 | `openaiCompatible.ts` factory + new entries `mistral`, `cloudflare`, `sambanova`, `groq-120b`, `gemma`; `terms` on every provider; `audience` filter in `orderedProviders`; roles `tutor`, `tutor-check`, `assistant`; limiter defaults for the new entries | §5.7.2–5.7.3. New env vars: `MISTRAL_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`, `SAMBANOVA_API_KEY`, `GEMMA_MODEL`, `GROQ_120B_MODEL`, `AI_MINOR_SAFE_PROVIDERS` |
| P3 | `piiScrubber.ts`, the tutor pipeline (`services/assistant/tutorPipeline.ts`), the answer cache, `ai_provider_evals` table + `scripts/eval-tutor.mjs` | §5.7.4 |
| P3 | Fair-share caps job (06:00 Kigali) + parent AI consent (`parent_consents`, parent-portal toggle) | §5.7.5–5.7.6 |
| P3 | **Fix:** learner course tutor (`/elearning/my/courses/:id/ask`) moves to the `tutor` role (audience `minor`) | Today it uses the default order, which starts with Gemini (18+ terms) |
| P3 | `POST /assistant/chat` (SSE), `GET/DELETE /assistant/conversations[/:id]`, `POST /assistant/messages/:id/report` | |
| P3 | Tables: `assistant_conversations`, `assistant_messages`, `assistant_flags` | indexes on `(user_id, created_at)` and `(status)` |
| P3 | Admin review: `GET /assistant/review?flagged=1`, redact | Same pattern as the oversight module |
| P4 | `GET /desktop/tools/roster/:classGroupId` | First names + IDs for the teacher's own classes only (placement-scoped). Reuse an existing endpoint if one already returns this. |
| P5 | `GET /desktop/tools/flashcards/decks`, FSRS review sync | Reuses the e-learning FSRS tables, so reviews count in both places |
| P5 | Formula-sheet content (`tool_content` table, Markdown + KaTeX, per subject and level) | Heads of department edit it in MIS. The desktop caches it. |
| P6 | Games: `tool_game_settings` (global switch, per-game on/off, audience rules, schedule, budgets), `tool_game_overrides` (student, kind, until, reason, by), `tool_class_game_time` (class, games, until, by), `tool_game_usage` (user, game, date, minutes, learning) | §6.7.5; resolved into the policy's `games` block |
| P6 | `POST /desktop/tools/games/usage` (batched), `POST/DELETE /desktop/tools/class-game-time`, `POST/DELETE /desktop/tools/games/overrides` | Teachers only for their own classes (placement-scoped) |
| P7 | `PUT /desktop/tools/settings` + an MIS admin page "Desktop tools" | Tabs: **Tools** (on/off per persona), **Games** (the 10 layers), **AI** (quotas, lesson lock, provider register, evals, usage), **Translations** (opens the workspace), **Usage** |

**Add to the MIS activity catalog** any new frontend route (the catalog test requires every route). Run vitest before merging, because the deploy workflow doesn't run tests.

---

## 8. Roadmap: phases and tasks

**Estimates assume** 2 frontend developers, 1 Rust/full-stack developer, and part-time backend. "dw" = developer-weeks.

**Each phase ends with:**
- a release through the normal `npm run release` flow;
- the manual checklist in §9.2;
- a short demo to pilot users: 2 teachers, 5 students, 1 office staff member.

### Phase 0: Foundations (≈ 1.5 dw)

**Goal:** the empty Tools Hub works end to end, and adding a tool is a 4-step job.

| # | Task | Done when |
|---|---|---|
| 0.1 | `src/tools/types.ts`, `registry.ts`, `ToolHost.tsx` with error boundary + `Suspense` | A dummy "Hello" tool opens in the panel; a crash in it shows "This tool stopped — Reload" without breaking the shell |
| 0.2 | Title-bar **Tools** button; `panel` state becomes `false \| "notices" \| "tools"` | The panel opens and closes, the app shrinks via insets, and the width is remembered |
| 0.3 | Tools panel: grid by group, search, favourites (★), recent | Typing "calc" filters; favourites persist in `settings.json` |
| 0.4 | Palette integration: every manifest becomes a ⌘K entry "Tool: …" | ⌘K → "timer" opens the timer |
| 0.5 | `tools/windows.rs`: pop-out window (`index.html?tool=<id>`), *always on top* toggle, *present* (full screen on chosen display) | Pop-out survives switching apps; Present goes to the second display. Uses `create_later()`; **never create a WebView2 inline in a callback** |
| 0.6 | `capabilities/tools.json`: grant store/sql/notification + tool commands to `shell` and `tool-*` windows only | App webviews (remote origins) can't call tool commands; checked by a probe |
| 0.7 | `tools/db.rs` + `tauri-plugin-sql` (SQLite), per-user file, migration runner | Unit test: two users get separate DBs; sign-out closes the DB |
| 0.8 | `shared/i18n.ts` (en/fr/rw) with a runtime override layer (filled in Phase 2), key-extraction script, CI check | `npm test` fails if a key is missing in `en`; missing FR/RW keys are listed as warnings |
| 0.9 | Optional global shortcut (`tauri-plugin-global-shortcut`), **off by default**, set in Settings → Tools | ⌥/Alt+Space (configurable) shows NGA with the Tools panel; clean fallback if the shortcut is taken |
| 0.10 | `THIRD_PARTY_NOTICES.md` + a licence check in CI (`license-checker`, allow-list MIT/ISC/BSD/Apache-2.0) | CI fails on GPL/AGPL/CC-BY-SA dependencies |

### Phase 1: Everyday offline tools (≈ 3 dw) — *first shippable release*

| # | Task | Done when |
|---|---|---|
| 1.1 | **Calculator** (spec §12.1) | Golden tests pass (≥ 60 expressions incl. precedence, deg/rad, fractions, %); keyboard-only use works |
| 1.2 | **Unit converter** (length, mass, time, temperature, area, volume, speed, energy, data; RWF currency online with cached rates and date shown) | Works offline except currency; shows the "rates from <date>" label |
| 1.3 | **Timers** in Rust (`timers.rs`): countdown, stopwatch with laps, several at once, presets (1/3/5/10/25 min) | A timer finishes and an OS notification + sound arrive **with the panel closed and the app minimised**; timers survive a restart |
| 1.4 | **Present view** for the timer (huge digits, colour + text at 1 min / 0) | Readable from the back of a classroom (min. 20 vh digits) |
| 1.5 | **Focus timer** (work/break lengths adjustable, default 25/5), turns on the desktop's Do Not Disturb for the session, daily log | Notifications from the 4 apps are held during focus and released after; the log appears in "Today" |
| 1.6 | **Quick notes** (Markdown + KaTeX, search, pin, tags, export .md/.pdf) | 1,000 notes still search in < 100 ms; data is per user |
| 1.7 | **Date calculator** (difference, add/subtract, working days excl. weekends + holidays) | Rwanda public holidays seeded for 2026–2027 (editable later via MIS, P7); tests for leap years |
| 1.8 | **QR generator** (URL, text, Wi-Fi, contact), PNG/SVG save, copy | Scans correctly with a phone at 3 sizes |
| 1.9 | Signed-out mode: only anonymous tools visible (§6.2) | Sign out → notes disappear from the grid; calculator still works |

### Phase 2: Identity, policy, calendar and translations (≈ 3.5 dw, incl. MIS PR)

| # | Task | Done when |
|---|---|---|
| 2.1 | MIS: `POST /auth/desktop-tools-token`, `requireAudience`, route allow-list, tests | Using the token on `/marks` returns 403; on `/desktop/tools/me` returns 200 |
| 2.2 | Desktop: `api.rs` (reqwest + rustls), token minted via the MIS webview after "MIS signed in", dropped on sign-out | The log shows "tools token ok (persona=teacher)"; the token is never in JS (grep the bundle + devtools) |
| 2.3 | MIS: `GET /desktop/tools/me`, capabilities added to the manifest + presets | Student, teacher, staff and parent test users each get the right tool set |
| 2.4 | MIS: `GET /desktop/tools/policy` (lessons from live lessons, exams from Reminder Hub sources) | Unit tests in Kigali time across midnight; a slot from 08:00–09:40 locks games exactly then |
| 2.5 | Desktop: `policy.rs` cache + offline evaluation + "instant exam" signal from the TM URL | Pull the network cable → the lock still starts and ends on time from the cache |
| 2.6 | **My Day / calendar** tool: today + week, from `/reminders/agenda` and `/calendar/my-calendar`; tap an event → open it in its app tab | Matches what MIS shows for the same user; works from the cache offline |
| 2.7 | **Event countdowns** ("Exams in 12 days", "Next lesson in 8 min"); optional title-bar chip | Countdown chip updates every minute; hidden in focus mode |
| 2.8 | MIS: translation tables + endpoints + `TOOLS_TRANSLATIONS_MANAGE` (admin presets by default) + audit; CI `i18n:sync` registers the English keys at each release | A non-admin can't open the workspace; once an admin grants a Kinyarwanda teacher the capability, the teacher can |
| 2.9 | Desktop: **Translation workspace** tool (list, filters, statuses, in-context Alt/⌥-click, "Suggest with AI" as an AI draft, approve, publish, roll back) + runtime overrides cached offline + `npm run i18n:pull` | A published RW fix appears on another signed-in desktop within 5 min with no app update; rolling back restores the old text; English edits mark FR/RW as *outdated* |

### Phase 3: AI Assistant at $0 (≈ 4.5 dw, incl. MIS PR)

This phase ships in two releases, following decision D1 (staff first).

**3A: provider expansion + staff assistant (≈ 2.5 dw)**

| # | Task | Done when |
|---|---|---|
| 3.0 | **Fix first (small separate MIS PR):** route the learner course tutor (`/elearning/my/courses/:id/ask`) through audience `minor` | A unit test proves no provider with `allowsMinors:false` can serve a STUDENT call, for every role order |
| 3.1 | Accounts and keys (admin checklist): Mistral (SMS verification, **training opt-out OFF**), Cloudflare (Workers AI token), SambaNova, Google AI Studio model switch to Flash-Lite + Gemma; keys in local and prod `.env` (MIS by hand; TM/DA via GH secrets if they adopt it) | `GET /elearning/admin/ai-usage` lists all 11 entries and their configured state |
| 3.2 | MIS: `openaiCompatible.ts` factory; entries `mistral`, `cloudflare`, `sambanova`, `groq-120b`, `gemma`; `terms` on all providers; limiter defaults (GLM concurrency 1, SambaNova 20 RPD per model, Cloudflare ≈ 350/day neuron-based estimate, Mistral by monthly credit) | Contract test per provider with recorded responses; a live smoke test spends $0 (check each console) |
| 3.3 | MIS: audience filter, new roles (`tutor`, `tutor-check`, `assistant`), `AI_MINOR_SAFE_PROVIDERS`, `piiScrubber.ts` | The PII test corpus (names, phones, emails, IDs) is fully scrubbed; role orders are checked against terms in a unit test |
| 3.4 | MIS: `generateChat()` with streaming + fallback | Integration test: `groq-120b` 429 → `gemini` → `gemma` → `groq`…; usage logged per entry |
| 3.5 | MIS: server-side mode prompts (Tutor, Teacher, Staff, Parent), versioned, with CBC subject and level context; input ≤ 1,500 tokens (last 6 turns + rolling summary) | Snapshot tests of the assembled prompts; token budget asserted |
| 3.6 | MIS: tables, retention job (180 days), quotas, exam/lesson lock (423) | During a seeded exam window the endpoint refuses; quota resets at Kigali midnight |
| 3.7 | Desktop: chat UI (streaming for staff, Markdown + KaTeX + code, copy, stop, new chat, history), first-use notice, "answered by ⓘ" | Works in the panel and pop-out |
| 3.8 | **Quick actions**: Explain / Simplify / Translate EN↔FR↔RW / Summarise on selected text | Right-click in notes and the AI panel; ⌘K "Ask AI…" |
| 3.9 | **Release 3A to staff** (Teacher, Staff modes) + 2-week pilot of the review flow | Pilot report: usage, provider mix, flags handled |

**3B: student tutor (≈ 2 dw, after the pilot)**

| # | Task | Done when |
|---|---|---|
| 3.10 | MIS: **tutor pipeline**: input moderation, silent-plan draft, **leak check**, one regeneration, safe template, output moderation; Tutor replies are not streamed | With the adversarial set, final-answer leaks are ≤ 2% end to end; median reply time ≤ 8 s on cloud providers |
| 3.11 | `scripts/eval-tutor.mjs` + `ai_provider_evals` + **eval-gated admission** to the `tutor` order (§5.7.4) | A model below the thresholds is automatically left out of the tutor order; results are shown on the admin AI page |
| 3.12 | **Fair-share caps** job (06:00 Kigali), one shared student cap (desktop + MIS course tutor), remaining-turns counter, staff↔student reflow, "offline helpers first" suggestions, teacher-pinned answers | A simulated day with 300 students never exceeds measured capacity; nobody gets 0 turns before 14:00; cache hits do not use the cap |
| 3.13 | **Parent AI consent** (parent portal) + age gate + routing of no-consent students to `cloudflare`/`glm` | A student without consent never reaches `mistral` (test); under-13 accounts see the age message |
| 3.14 | **Answer cache** for concept questions (7 days) | Hit rate measured in the pilot; homework-shaped prompts are never cached (test) |
| 3.15 | MIS admin: review page for flagged chats (read/redact) + **provider register** (terms, review date, usage) | `TOOLS_AI_ASSISTANT_REVIEW` required; redactions are audited |
| 3.16 | *(moved to §11.3, later)* School AI server | — |
| 3.17 | Audit TM, Tendo and Tupo for AI features students can reach; port audience routing where needed | Audit note in each repo; no student path reaches an 18+ provider |
| 3.18 | *(dropped: O2 = no)* Gemini-for-Education link | — |
| 3.19 | **Release 3B to students** | Pilot classes first, then the whole school |

### Phase 4: Classroom kit for teachers (≈ 2.5 dw)

| # | Task | Done when |
|---|---|---|
| 4.1 | MIS roster endpoint (placement-scoped) + desktop cache | A teacher sees only their own class groups; works offline from the cache |
| 4.2 | **Random name picker**: wheel or card flip, "no repeats until all picked", mark absent, sound on/off | Fairness test: 10,000 draws are uniform (χ² test) |
| 4.3 | **Group maker**: by group size or number of groups; keep-apart pairs; reshuffle; copy as text | Sizes differ by at most 1; "keep apart" rules are respected |
| 4.4 | **Noise meter**: Web Audio level, adjustable threshold, "Quiet/OK/Too loud" + optional chime | Needs a mic-permission probe in the shell webview (WKWebView/WebView2); add a row to `BROWSER_COMPATIBILITY.md` |
| 4.5 | **Traffic light / work-mode signs** with custom text | Present mode readable at 8 m |
| 4.6 | **Whiteboard** (Excalidraw, lazy-loaded), maths text via KaTeX, save per class, export PNG/PDF | Opens < 1.5 s on a mid-range laptop; boards stored per user |
| 4.7 | **Present mode** for every classroom tool + a "Classroom screen" layout (timer + traffic light + picker side by side) | One click from the panel to the projector |
| 4.8 | **Grade calculator**: weighted components, CBC bands (configurable), what-I-need-to-reach-X | Matches MIS report-card rounding for 20 sample cases |

### Phase 5: Study kit for students (≈ 3 dw, incl. MIS PR)

| # | Task | Done when |
|---|---|---|
| 5.1 | **Graphing calculator** (function-plot; several functions, sliders for parameters, zeros/intersections, table view, PNG export) | Plots `sin(x)`, `x^2-4`, `a*x+b` with sliders; 60 fps panning |
| 5.2 | **Periodic table** (PubChem-derived dataset, groups/blocks, filters, element card, **molar-mass calculator** for formulas like `Ca(OH)2`) | Molar masses match PubChem for 50 compounds; attribution shown |
| 5.3 | **Formula sheets**: MIS `tool_content` (HoD-editable), desktop cache, search, favourites | Physics/Chemistry/Maths S1–S6 seeded by teachers; renders offline |
| 5.4 | **Flashcards** (ts-fsrs): own decks, decks from MIS e-learning, **AI-made decks from a note or topic** (Teacher can publish to a class) | Reviews sync both ways with e-learning FSRS; offline reviews sync later without duplicates |
| 5.5 | "Today" study widget: due cards, focus minutes, next exam countdown | Shows on the Tools panel home for students |

### Phase 6: Games programme with full control (≈ 4.5 dw, incl. MIS PR)

| # | Task | Done when |
|---|---|---|
| 6.1 | `GameShell` + `GameModule` API + `seed.ts` + no-network CI test (§6.7.6) | A sample game saves and restores exactly; CI fails on `fetch` in `games/` |
| 6.2 | `games.rs`: play-time accounting (focus, visibility, 60 s idle), session cap + cool-down, usage queue → MIS | Simulated sessions: budget counted within ±5 s; offline play syncs later without double counting |
| 6.3 | MIS: game tables, policy `games` block (layers 1–8 resolved per user), usage endpoint, class-game-time and override endpoints | Unit tests for precedence: exam lock beats class game time beats schedule beats budget |
| 6.4 | Desktop enforcement + messages ("open again at 12:20", "time for Stand & Stretch"), auto-save on lock | A game open when a lesson starts saves and pauses with the right reason |
| 6.5 | **Teacher "Class game time"** in the Classroom kit (pick games, 5–30 min, for one class) | Students in that class see the games unlock in < 60 s (policy push/refresh); auto-expiry works |
| 6.6 | **Per-student overrides** (block/extend, reason, expiry) for class teacher/counsellor/admin | Audited; expired overrides stop applying |
| 6.7 | Tatham WASM wrapper + `games` pack → **Picture Logic, Bridges, Mines, Untangle** | All 4 run offline from the pack; MIT notice included |
| 6.8 | **Number Place** (sudoku.js; daily shared puzzle), **Merge to 2048** | Every puzzle has a unique solution (1,000 tested); 2048 uses its own art |
| 6.9 | **Pairs** (themed sets), **Echo**, **Code Breaker**, **Four in a Row**, **Snake**, **Mental Math Sprint** | Each passes the per-game checklist (§6.7.6) |
| 6.10 | **Five-Letter Guess** and **Word Search** with curated EN/FR/RW `wordlists` pack | Packs reviewed by holders of `TOOLS_TRANSLATIONS_MANAGE`; no offensive words (blocklist test); look differs from Wordle |
| 6.11 | **Igisoro** (2 players on one device, variant setting, rules screen in RW/EN/FR). **Ships switched off.** The **super admin** reviews the rules screen and the chosen variant in MIS → Desktop tools → Games, then approves; that approval switches it on | Super-admin approval is recorded (who, when, variant) in the audit log; move-engine unit tests for sowing, relay, capture and the end condition |
| 6.12 | **Typing tutor** (lessons → speed test, EN/FR texts) | Personal bests only |
| 6.13 | Reset activities **Breathe** and **Stand & Stretch** | Shown at every session cap; never count toward the budget |
| 6.14 | Pilot with 2 classes for 2 weeks; tune the defaults with teachers and the student council | Decision note: budget, session cap, games kept or dropped |

### Phase 7: Office tools and admin console (≈ 2.5 dw, incl. MIS PR)

| # | Task | Done when |
|---|---|---|
| 7.1 | **PDF tools** (merge, split, reorder, rotate, delete pages, watermark, images→PDF, basic compress) | A 100-page PDF merges in < 3 s; nothing is uploaded |
| 7.2 | **Scanner** (webcam or image file → edge detect → perspective fix → B/W enhance → multi-page PDF) | 5 test documents produce straight, readable pages |
| 7.3 | **OCR** (tesseract.js + `ocr-eng-fra-swa` pack; copy text; searchable PDF) | ≥ 95% character accuracy on clean EN/FR printouts; RW shown as "best effort" |
| 7.4 | Working-day calendar from MIS (holidays and term dates edited by admin) replaces the seeded list | Date calculator uses the school calendar when online |
| 7.5 | **MIS admin page "Desktop tools"** with tabs **Tools** (on/off per persona), **Games** (all 10 layers of §6.7.5), **AI** (quotas, lesson lock, provider register, evals, usage), **Translations** (opens the workspace), **Usage** (aggregate) | Change in MIS → desktop applies within 5 min (policy refresh) or on the next start |

### Phase 8: Hardening and v1.0 of the Tools Hub (≈ 1 dw)

| # | Task | Done when |
|---|---|---|
| 8.1 | Accessibility audit (§6.5) with keyboard + VoiceOver + NVDA | No blocker issues open |
| 8.2 | Performance budget: shell start time unchanged (±100 ms); installer growth ≤ 6 MB; panel opens < 200 ms | Measured on the CI probe machines |
| 8.3 | Kinyarwanda and French review of all strings in the translation workspace | Every key is *approved* in FR and RW by a `TOOLS_TRANSLATIONS_MANAGE` holder; none is *outdated* |
| 8.4 | User guide pages (one short page per tool, EN/FR/RW) linked from each tool's "?" | Published on MIS `/apps` help |
| 8.5 | Pilot feedback round + backlog of "later" tools (§3) re-prioritised | Decision recorded in this doc |

**Phase summary**

| Phase | Theme | dw | Depends on | Ships to users? |
|---|---|---|---|---|
| 0 | Foundations | 1.5 | — | internal |
| 1 | Everyday offline tools | 3 | 0 | ✅ v0.3 |
| 2 | Identity, policy, calendar, translations | 3.5 | 0 | ✅ v0.4 |
| 3 | AI at $0: 3A staff → 3B student tutor | 4.5 | 2 | ✅ v0.5 (staff) · v0.5.x (students) |
| 4 | Classroom kit | 2.5 | 2 | ✅ v0.6 |
| 5 | Study kit | 3 | 2 (5.4 also needs 3) | ✅ v0.7 |
| 6 | Games programme + controls | 4.5 | 2 (policy) | ✅ v0.8 |
| 7 | Office + admin console | 2.5 | 2 | ✅ v0.9 |
| 8 | Hardening | 1 | all | ✅ Tools v1.0 |
| | **Total** | **≈ 26.5 dw** (≈ 12–14 calendar weeks with 2 parallel tracks) | | |

Phases 4–7 can run **in parallel** once Phase 2 is done. A sensible split:
- **Track A (frontend):** Phase 4, then Phase 6.
- **Track B (frontend + backend):** Phase 3, Phase 5, then Phase 7.

---

## 9. Testing

### 9.1 Automated (CI on every PR)

- **Unit (vitest):** every tool's logic sits in a pure module with its own tests:
  - calculator engine (golden expressions)
  - date maths
  - group maker
  - molar mass
  - sudoku uniqueness
  - policy evaluation (Kigali time, midnight, DST-free)
  - games precedence (all 10 layers)
  - Igisoro move engine
  - save/restore round trip for every game
  - i18n override merge
- **Rust (`cargo test`):**
  - `timers.rs`: a fake clock, plus restore after restart
  - `policy.rs`: offline evaluation and fail-closed for games
  - `db.rs`: per-user isolation
  - `api.rs`: the token is dropped on sign-out
  - `games.rs`: focus/idle accounting, cool-down, offline queue without double counting
- **MIS (jest/vitest):**
  - the token audience is refused on routes outside the allow-list
  - policy windows
  - quotas
  - the 423 exam lock
  - moderation flags
  - **audience routing:** every role order is checked against provider terms, and no `minor` call can reach an `allowsMinors:false` provider
  - PII scrubber corpus
  - fair-share cap maths
  - parent consent routing
  - translation permission (non-holders get 403) and release/rollback
- **AI tutor evaluation:** `scripts/eval-tutor.mjs` (§5.7.4) runs about 80 prompts per provider/model. It checks:
  - with adversarial students, Tutor doesn't leak final answers;
  - Tutor helps with hints;
  - the language matches the question;
  - harmful prompts are flagged.

  Results go into `ai_provider_evals` and decide tutor admission. Run it **monthly**, when a model changes, and on demand. Never run it per PR, because it uses free quota. Schedule it after 18:00 Kigali time so it doesn't compete with school hours.
- **Licence check:** the CI allow-list from task 0.10.
- **Probe:** extend `scripts/probe-ci.mjs` with:
  - Tools panel open/close and insets
  - pop-out window
  - Present on the second display (when available)
  - microphone permission in the shell webview

  Screenshots go to the artifacts, as today.

### 9.2 Manual release checklist (added to the existing one)

- [ ] Tools panel opens beside each of the four apps; the app stays clickable.
- [ ] Timer finishes with NGA minimised → OS notification + sound on Windows 11 **and** macOS.
- [ ] Present mode on a real projector or second screen, then unplug the second screen → the window comes back to the main screen.
- [ ] Sign out → personal tools disappear, pop-outs close; sign in as another user → none of the first user's data is visible.
- [ ] Airplane mode: everything marked ● works; the calendar shows "updated <time>"; AI shows "needs internet".
- [ ] Student test account during a seeded lesson slot: games locked with the right reason; AI in Tutor mode; seeded exam → AI locked (423).
- [ ] RW language: spot-check 3 tools for missing or English strings.
- [ ] Publish a translation fix from the workspace → it appears on a second desktop within 5 min; roll back works.
- [ ] Teacher opens "Class game time" for a class → a student desktop unlocks the chosen games in < 60 s, and they lock again at expiry.
- [ ] Student at the 10-min session cap → game saves, Stand & Stretch shows, cool-down is enforced.
- [ ] AI admin page: every provider shows its terms status; turning off one provider in env → traffic moves to the next one with no errors visible to users.

---

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Free AI capacity is too small** for unlimited tutoring (cloud ≈ 700–1,500 student turns/day vs ≈ 3,000 demand) | Students hit caps early | Fair-share caps (§5.7.5), answer cache, staff→student reflow, the Gemini-for-Education link, and the optional school AI server (+3,000–6,000/day). Show "You have 2 tutor questions left today" clearly |
| **Provider terms on minors** (Gemini API, Groq, OpenRouter: 18+) | Breach of terms; account suspension | Audience routing enforced in one place + unit test; provider register reviewed every term; task 3.0 fixes the existing course tutor |
| **Free tiers change or disappear** (5 changes in 2026) | Sudden loss of capacity | 11 entries, one-env-change switch-off, cooldown/circuit breaker already in `registry.ts`, monthly check of each console |
| **Free-tier data used for training** (Gemini free; Mistral unless opted out) | Privacy | Student traffic never goes to Gemini; PII scrubber on all trains-on-data providers; Mistral opt-out turned off at signup (task 3.1) |
| **Small models leak answers** | Learning harm | Leak-check pass, eval-gated admission, safe template fallback |
| **Students use AI to do homework** | Learning harm (§2.2) | Tutor-only mode, prompt eval in CI, teacher visibility, integrity note |
| **Safeguarding content in chats** | Child-safety incident | Moderation pass, routing to safeguarding staff, retention + audit, clear notice to students |
| **Games distract in class** | Teacher complaints, feature turned off | Lesson/exam lock from the timetable, budgets, admin kill switch per game |
| **Game IP claims** (names, look and feel) | Takedown request | Generic names, original art, rules in §6.7.4 checked in code review |
| **Igisoro rules disputed** (regional variants) | Cultural credibility | Super-admin approval before it switches on (O4); variant setting; rules screen shows the variant name |
| **Bad translation published** by a permission holder | Confusing UI | Statuses, optional second reviewer, one-click rollback, audit log |
| **Token leakage** from the shell | Account misuse | Narrow-audience 8 h token, Rust-only, allow-listed routes |
| **Mic/camera permissions differ** across WKWebView/WebView2 in the shell origin (`tauri://localhost`) | Noise meter/scanner fail on one OS | Probe first (Phase 0/4), add `NSMicrophoneUsageDescription`/`NSCameraUsageDescription` checks, document in `BROWSER_COMPATIBILITY.md` |
| **Installer bloat** (Excalidraw, tesseract, Blockly) | Slow downloads on school connections | Lazy chunks + downloadable packs + 6 MB budget enforced in CI |
| **Shared lab PCs** leak personal data | Privacy complaint | Per-user DBs, close on sign-out, signed-out mode shows anonymous tools only |
| **Timetable data drift** (the known period-grid mismatch in MIS) | Locks at the wrong times | Policy uses the same live-lessons rule as the teacher timetable; pilot with a real class before turning on locks school-wide |
| **Licence violation** by a later dependency | Legal risk | CI licence allow-list; §4.4 table maintained |

---

## 11. Decisions

### 11.1 Accepted (2026-10-05)

| # | Decision | Final answer |
|---|---|---|
| **D1** | Students and AI | **Staff first (release 3A), then Tutor mode for students (3B)** after a 2-week staff pilot |
| **D2** | Minimum age | **13+, with parental notice.** Mistral additionally needs **parental consent** (§5.7.6) |
| **D3** | AI budget | **$0, free solutions only.** Free cloud providers with audience routing and fair-share caps (§5.7). Paid ideas are parked in §11.3 |
| **D4** | Games | **The researched programme in §6.7:** 15 v1 games + 2 reset activities; everything on/off at 10 layers; defaults 30 min/day, 10 min/session, quiet hours 21:30–06:00; tuned after the pilot (6.14) |
| **D5** | Translation review | **Anyone with `TOOLS_TRANSLATIONS_MANAGE`; by default only admins** (§6.3.1) |
| **D6** | Usage analytics | On, counts only |
| **D7** | Chat retention | 180 days |
| **D8** | Desmos/GeoGebra | Ship the MIT grapher; email both vendors in parallel |
| **D9** | Parents | Parent mode in the API; no parent-only desktop tools in v1 |

### 11.2 Owner answers and remaining items

| # | Item | Answer / status | Effect on the plan |
|---|---|---|---|
| **O1** | A school PC with an NVIDIA GPU? | **No** | No school AI server; student AI = free cloud only; the `local` entry moves to §11.3 |
| **O2** | Google Workspace for Education or Microsoft 365? | **No** | No Gemini-for-Education / Copilot link (task 3.18 dropped) |
| **O3** | Anthropic–Rwanda MOU and OpenAI Academy credits | **Later** | Listed in §11.3 |
| **O4** | Who validates Igisoro? | **The super admin** | Igisoro ships off; super-admin approval in MIS switches it on (task 6.11) |
| **O5** | SambaNova terms (age, training) | Dev lead, before task 3.2 | Until checked, SambaNova is staff-only |
| **O6** | Confirm Z.ai GLM-Flash limits and Gemini/Gemma quotas in the consoles | Dev lead, task 3.1 | Updates the numbers in §5.7.5 and the limiter defaults |
| **O7** | REB/MINEDUC guidance on generative AI in schools | Leadership, before release 3B | Align the student notice and rules if guidance exists |

### 11.3 Later, when a budget or donation exists (not in this build)

Ordered by how much each item helps for its cost. None of these is needed to deliver v1.

| Item | Rough cost | What it gives |
|---|---|---|
| **OpenRouter one-off $10 credit** | $10 once | Free-model limit goes from 50 to **1,000 requests/day** (staff pool, 18+ terms). Cheapest big win for staff |
| **Mistral pay-as-you-go top-up** | from a few $/month | More student-safe tutor capacity (Mistral allows minors with parental consent) |
| **Used GPU for a school AI server** (RTX 3060 12 GB class) or a donated gaming PC | ~$250–300 once | **+3,000–6,000 student-safe turns/day**; data never leaves the school; turn on `local` (runbook task, Cloudflare Tunnel is free) |
| **DeepSeek top-up** (already integrated, zero balance today) | a few $/month | Cheap, strong staff model (check its terms on minors before any student use) |
| **Anthropic–Rwanda MOU educator licences / OpenAI Academy credits** (O3) | $0 if NGA qualifies; needs leadership time | Teachers' heavy use leaves the free pool |
| **Google Workspace for Education Fundamentals** | $0 for qualifying schools, but a migration project | Gemini app + NotebookLM for all ages, no training on data |
| Apple Developer ID (fee waiver for education) / Windows code-signing | $0–$99/yr / OV cert | Removes install warnings (already tracked in the desktop distribution notes) |

---

## 12. Appendix: tool specifications

These are short specs for the tools the team will build first. Use them as acceptance criteria.

### 12.1 Calculator

- **Modes:** Basic and Scientific, toggled with remembered state. A "Programmer" mode is out of scope.
- **Engine:** mathjs `evaluate` in a **restricted instance**. Disable `import`, `createUnit`, `evaluate` inside expressions and `parse` (mathjs security guidance). Use BigNumber with 64 digits for display accuracy.
- **Features:**
  - `sin cos tan` (+ inverse, hyperbolic) with **DEG/RAD** toggle;
  - `log ln √ ^ ! nCr nPr %`, `π e`, `Ans`, memory (M+, M−, MR, MC);
  - fractions (`1/3 + 1/6 → 1/2`);
  - units in expressions (`5 km to m`);
  - scientific notation.
- **History:** each line shows the expression rendered with KaTeX plus the result. Click a line to reuse it. History is stored per user (anonymous history is cleared on close).
- **Keyboard:**
  - the full keypad;
  - `Enter` = equals, `Esc` = clear;
  - `⌘/Ctrl+C` copies the result.
- **Errors:** messages in plain words, e.g. *"Can't divide by zero"*, never a stack trace.
- **Tests:** at least 60 golden cases, including `2+3*4=14`, `sin(30)=0.5` in DEG, `0.1+0.2=0.3` exactly (BigNumber), `5!` and `10 nCr 3=120`.

### 12.2 Timers (Rust-backed)

- **Why Rust:** JS timers in a hidden webview are throttled. Deadlines are kept in Rust (`timers.rs`, tokio) and persisted in the store, so a timer finishes on time even when the panel is closed.
- **Commands:**
  - `timer_create {label, kind: countdown|stopwatch, durationMs}`
  - `timer_pause/resume/reset/delete`
  - `timer_list`
- **Events:** `nga://timer {id, state, remainingMs}` once per second, only while a view is open.
- **On finish:**
  - send `notifications.rs` banner "⏰ <label> finished" (this respects DND, *except* the focus timer's own end alert);
  - play a sound (3 choices + silent);
  - flash the Present view.
- **Restart:** a timer already overdue at start-up shows "finished while NGA was closed".

### 12.3 AI Assistant UI

- **Header:**
  - mode badge (Tutor / Teacher / Staff / Parent), which the user can't change;
  - the subject picker (students), which helps the tutor stay on topic;
  - "New chat".
- **First run:** a short notice, which must be accepted:
  - what AI is good and bad at;
  - who can see the chats;
  - "don't share passwords or personal information".
- **Messages:**
  - Markdown, KaTeX and code blocks, with a copy button;
  - stop generating;
  - 👍 / 👎;
  - "Report" (creates a flag).
- **Limits:** "2 of 5 tutor questions left today" (the cap comes from §5.7.5 and is refreshed each morning). When locked or capped, the reason and the time it reopens replace the input box.
- **Tutor mode:** shows "Thinking…" and then the whole reply (leak-checked, not streamed). Staff modes stream.
- **"ⓘ Answered by":** the provider label, for example "school server" or "Mistral".
- **Offline:** the input is disabled with "AI needs internet". History is read-only from the cache.

### 12.4 Random name picker and group maker

- The source is a cached MIS roster, showing first name + initial for privacy on a projector. Teachers can also paste a list for clubs and other ad-hoc groups.
- **Picker modes:**
  - **Fair:** no repeats until everyone has been picked. This is the default.
  - **Pure random.**
- Teachers can mark students absent for today.
- **Groups:**
  - by size or by number of groups;
  - "keep apart" pairs, saved per class;
  - show on Present as cards;
  - copy as text to paste into Tupo or Task Mentor.

### 12.5 Policy evaluation (shared by games and AI)

```ts
// src/tools/shared/policy.ts — pure, unit-tested, also mirrored in policy.rs
export function evaluate(p: Policy, nowUtc: Date, tool: ToolManifest, online: boolean): Verdict {
  if (p.tools.disabled.includes(tool.id)) return lock("Turned off by the school");
  if (tool.policyClass && p.exam.active)  return lock("Paused during the exam", p.exam.until);
  if (tool.policyClass === "game") {                                  // §6.7.5, deny-first
    const g = p.games;
    if (g.override?.kind === "block")     return lock("Games are paused for you", g.override.until);
    if (!g.enabled)                       return lock("Games are turned off by the school");
    const classTime = g.classGameTime && nowUtc < new Date(g.classGameTime.until)
                      && g.classGameTime.games.includes(tool.id);
    if (classTime)                        return OPEN;                                            // teacher-opened, no budget
    if (!g.allowed.includes(tool.id))     return lock("This game isn't available for you");
    if (isStale(p, nowUtc))               return lock("Connect once to refresh school times");   // fail closed
    const w = activeWindow(p.windows, nowUtc);                                                    // Africa/Kigali
    if (w)                                return lock(`Paused during ${w.label}`, w.toUtc);
    if (inQuietHours(g.quietHours, nowUtc)) return lock("Games rest at night — see you tomorrow");
    const budget = g.dailyBudgetMin + (g.override?.kind === "extend" ? g.override.extraMin : 0);
    if (g.usedTodayMin >= budget)         return lock("You've played your time today — try Stand & Stretch!");
    if (inCooldown(g, nowUtc))            return lock("Short break first", cooldownEnds(g));
  }
  if (tool.policyClass === "ai") {
    if (!online)                          return lock("AI needs internet");
    const w = activeWindow(p.windows, nowUtc);
    if (w && !p.ai.allowedInLessons)      return lock(`AI is paused during ${w.label}`, w.toUtc);
  }
  return OPEN;
}
```

Server and client compute the same verdict. The **server is authoritative** for AI (the 423 response); the client verdict is only used for the UI and for offline games.

---

## 13. Sources

**v3 additions: free AI providers and terms (checked 2026-10-05)**
- Gemini API terms (under-18 clause; free-tier data use): https://ai.google.dev/gemini-api/terms · pricing: https://ai.google.dev/gemini-api/docs/pricing · rate limits: https://ai.google.dev/gemini-api/docs/rate-limits · regions: https://ai.google.dev/gemini-api/docs/available-regions
- Groq rate limits: https://console.groq.com/docs/rate-limits · deprecations: https://console.groq.com/docs/deprecations · Services Agreement: https://console.groq.com/docs/legal/services-agreement
- OpenRouter limits: https://openrouter.ai/docs/api/reference/limits · age change summary: https://conductatlas.com/platform/openrouter/openrouter-terms-of-service/age-eligibility-and-minor-access/
- Mistral pricing (free plan, training opt-out): https://mistral.ai/pricing · terms (minors): https://legal.mistral.ai/terms/commercial-terms-of-service
- Cloudflare Workers AI pricing (10,000 neurons/day): https://developers.cloudflare.com/workers-ai/platform/pricing/ · no training on customer content: https://www.cloudflare.com/service-specific-terms-developer-platform/
- Z.ai pricing (GLM Flash free): https://docs.z.ai/guides/overview/pricing · terms: https://docs.z.ai/legal-agreement/terms-of-use
- SambaNova rate limits: https://docs.sambanova.ai/docs/en/models/rate-limits
- Cerebras (no free tier): https://inference-docs.cerebras.ai/support/rate-limits · GitHub Models retired: https://github.blog/changelog/2026-07-30-github-models-is-now-retired/ · NVIDIA trial terms: https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf · Cohere limits: https://docs.cohere.com/docs/rate-limits · Hugging Face credits: https://huggingface.co/docs/inference-providers/en/pricing · Alibaba free quota: https://www.alibabacloud.com/help/en/model-studio/new-free-quota · Together billing: https://docs.together.ai/docs/billing · OVHcloud AI Endpoints: https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-capabilities
- Gemini & NotebookLM in Workspace for Education (all ages, no training): https://edu.google.com/intl/ALL_us/ai-gemini-notebook/
- Microsoft Copilot in education: https://www.microsoft.com/en-us/education/products/copilot-in-education
- Anthropic × Rwanda MOU: https://www.anthropic.com/news/anthropic-rwanda-mou
- Tutoring benchmarks: MathTutorBench https://arxiv.org/html/2502.18940v2 · answer leakage under adversarial students https://arxiv.org/html/2604.18660 · IrokoBench (Kinyarwanda) https://aclanthology.org/2025.naacl-long.139.pdf
- Self-hosting: llama.cpp CPU results https://github.com/ggml-org/llama.cpp/discussions/8273 · Ollama parallelism https://docs.ollama.com/faq · GPU speed comparison https://singhajit.com/llm-inference-speed-comparison/ (throughput figures in §5.7.5 are estimates; measure)

**v3 additions: games and brain breaks**
- Albulescu et al. 2022, micro-breaks meta-analysis: https://doaj.org/article/c6f37b6ba159469296b2cb968b65505f
- Rupp et al. 2017, casual game break: https://journals.sagepub.com/doi/10.1177/0018720817715360
- Russoniello, casual games and stress: https://news.ecu.edu/2008/04/28/ecu-study-shows-casual-video-games-relieve-stress/
- Classroom physical-activity breaks: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11822862/ · https://www.thecommunityguide.org/pages/tffrs-physical-activity-classroom-based-physical-activity-break-interventions.html
- WHO gaming disorder FAQ: https://www.who.int/standards/classifications/frequently-asked-questions/gaming-disorder
- ICO Children's Code, nudge techniques: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/13-nudge-techniques/
- Control patterns: Family Link https://support.google.com/families/answer/15938652 · Microsoft Family Safety https://support.microsoft.com/en-us/family-safety/set-app-and-game-limits · Prodigy Focus Mode https://www.prodigygame.com/main-en/blog/increase-time-on-task-prodigy-focus-mode/ · Apple Classroom https://support.apple.com/guide/classroom/apd9c29dc86b/mac
- Igisoro: https://en.wikipedia.org/wiki/Igisoro · https://artsandculture.google.com/story/jgUBvDEmLDOP1w · https://www.minaloc.gov.rw/news-detail/igisoro-a-game-changer-for-umurenge-kagame-cup
- IP: Tetris v. Xio https://www.loeb.com/en/insights/publications/2012/06/tetris-holding-llc-v-xio-interactive-inc · NYT Wordle clones https://fortune.com/2024/03/13/new-york-times-wordle-clones-copyright-knock-offs · Connect Four https://en.wikipedia.org/wiki/Connect_Four · Invicta (Mastermind) https://en.wikipedia.org/wiki/Invicta_Plastics
- Code and assets: Simon Tatham's puzzles (MIT) https://github.com/ghewgill/puzzles · 2048 licence https://github.com/gabrielecirulli/2048/blob/master/LICENSE.txt · public-domain cards https://github.com/notpeter/Vector-Playing-Cards · CC0 mahjong tiles https://github.com/FluffyStuff/riichi-mahjong-tiles · Lexique (CC BY-SA) https://pylexique.readthedocs.io/en/latest/readme.html

**v2 sources**

**Teacher and student tools**
- ClassroomScreen overview: https://blog.alludolearning.com/classroomscreen-a-comprehensive-tool-for-digital-classrooms · https://freetech4teach.teachermade.com/?p=2827
- WeAreTeachers survey of 500+ teachers: https://www.weareteachers.com/favorite-classroom-technology/
- Name pickers / groups / seating: https://freetech4teach.teachermade.com/?p=2930 · https://www.educatorstechnology.com/2023/05/random-group-generator-tool-for-teachers.html · https://seatingplan.com/tools
- Microsoft Learning Accelerators: https://microsoft.com/learningtools

**Learning science**
- Dunlosky et al. 2013 (study techniques): https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html
- Roediger & Karpicke 2006 (retrieval practice): https://cft.vanderbilt.edu/?p=22452
- Cepeda et al. 2006 (spacing meta-analysis): https://pubmed.ncbi.nlm.nih.gov/16719566/
- Anki / FSRS: https://faqs.ankiweb.net/what-spaced-repetition-algorithm
- Pomodoro study (Smits et al. 2025): https://cris.maastrichtuniversity.nl/en/publications/investigating-the-effectiveness-of-self-regulated-pomodoro-and-fl/

**Games**
- Clark, Tanner-Smith & Killingsworth 2016: https://www.sri.com/publication/education-learning-pubs/digital-learning-pubs/digital-games-design-and-learning-a-systematic-review-and-meta-analysis-brief/
- Sailer & Homner 2020: https://link.springer.com/article/10.1007/s10648-019-09498-w
- Game-based science learning meta-analysis: https://doaj.org/article/0675edc5557d4bc4b8ceeb2acddd79aa
- UNESCO GEM 2023 on devices and distraction: https://www.euronews.com/2023/07/26/unesco-calls-for-schools-around-the-world-to-ban-smartphones-in-the-classroom
- Blockly Games: https://blockly.games/about

**AI in education**
- UNESCO Guidance for GenAI in Education and Research (2023): https://unesdoc.unesco.org/ark:/48223/pf0000386693 · https://news.un.org/en/story/2023/09/1140477
- Bastani et al., "Generative AI can harm learning" (PNAS 2025): https://papers.ssrn.com/abstract=4895486 · https://scale.stanford.edu/ai/repository/generative-ai-can-harm-learning
- Khanmigo moderation and teacher visibility: https://support.khanacademy.org/hc/en-us/articles/21943797567629
- MagicSchool review: https://www.educatorstechnology.com/2026/02/magicschool-ai-review.html
- Rwanda National AI Policy (2023): https://extranet.who.int/countryplanningcycles/sites/default/files/public_file_rep/RWA_Rwanda_Artificial_Intelligence_Policy_2023.pdf
- Safe Exam Browser: https://safeexambrowser.org/about_overview_en.html

**Context**
- Rwanda school connectivity: https://allafrica.com/stories/202511270106.html
- Microsoft Lens retirement: https://www.techradar.com/pro/microsoft-is-killing-off-its-well-loved-lens-pdf-scanner-app-in-favor-of-ai
- WCAG 2.2: https://accessible-eu-centre.ec.europa.eu/content-corner/news/wcag-22-officially-w3c-recommendation-2023-10-06_en
- Kinyarwanda voice tech (Digital Umuganda / Common Voice): https://www.mozillafoundation.org/en/blog/how-rwanda-making-voice-tech-more-open/

**Libraries and licences**
- Tauri plugins: https://v2.tauri.app/plugin/ · global shortcut: https://v2.tauri.app/plugin/global-shortcut/ · SQL: https://v2.tauri.app/plugin/sql/ · store vs SQL: https://aptabase.com/blog/persistent-state-tauri-apps
- tldraw licence: https://tldraw.dev/community/license · https://tldraw.dev/sdk-features/license-key
- Desmos API: https://www.desmos.com/api · https://help.desmos.com/hc/en-us/articles/49078363315725
- GeoGebra licence: https://www.geogebra.org/license
- FullCalendar licence: https://fullcalendar.io/license
- chessground (GPL-3.0): https://www.npmjs.com/package/chessground
- PubChem periodic table data: https://www.nlm.nih.gov/oet/ed/pubchem/tutorial/04-200.html
- Other licences (mathjs, KaTeX, mathlive, function-plot, JSXGraph, ts-fsrs, chess.js, react-chessboard, Excalidraw, qrcode, pdf-lib, pdfjs-dist, tesseract.js, jscanify, blockly, markmap, sudoku-gen) were checked against the npm registry and GitHub on 2026-10-05.
