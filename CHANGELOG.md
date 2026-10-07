# Changelog

All notable changes to NGA Desktop. Web app changes ship with the web apps, not here.

## Unreleased

- **AI Tutor:** answers to common questions ("What is photosynthesis?") can come from the school's saved answers — instant, and they don't use one of the day's questions. When the school asks for a parent's permission, students are told how to get it.

## 0.14.0 — 2026-10-06

- **AI Tutor for students:** students now get an AI study coach in Ask AI. It explains topics, gives hints and checks their own answers, but doesn't do homework for them; every reply is checked for given-away answers and unsafe content before it is shown. It pauses during each student's own lessons and exams, students get a daily number of questions (set by the school), and they can report a bad answer. Students are told first that their chats are saved and may be reviewed by school staff. It uses all of the school's AI services in turn, so it keeps working when one is busy.
- Maths written by the AI as \( … \) or \[ … \] now displays properly (also in Notes).

## 0.13.0 — 2026-10-06

- **Easier to read:** colours across all tools now meet the WCAG AA contrast level in both themes (greys, green, amber and the dark-theme blue were adjusted), checked automatically on every tool.
- **Screen readers:** the periodic table and the translations list announce correctly; every button has a name.
- **Faster:** a tool opens in well under a tenth of a second when you open it from the launcher (it starts loading as soon as you point at it).

## 0.12.0 — 2026-10-06

- **Translations** (for people with the translations permission in NGA MIS; admins by default, and anyone they choose): review every French and Kinyarwanda text of the tools, correct it, ask AI for a draft, approve and publish. Every computer gets the published texts within 5 minutes — no app update needed — and an earlier release can be restored in one click. A correction is only used while the English text it translates is unchanged.
- Search boxes in Notes, Formulas and the periodic table now keep their icon inside the field.

## 0.11.0 — 2026-10-06

- **Scanner: get the text (OCR).** Read the text of scanned pages in English, French or both, then copy it or save it as a .txt file. The reading engine and languages come with the app: it works offline and nothing leaves the computer.
- PDF previews no longer risk hanging the first time the app starts: if the background reader doesn't answer, the page does the work itself.

## 0.10.0 — 2026-10-06

- **PDF tools** (everyone, offline): put pages of PDFs and pictures together, reorder (drag or arrows), turn, remove, add a watermark and page numbers, save the selected pages or split into one file per page. Nothing is uploaded; files go to Downloads.
- **Scanner** (everyone, offline): photograph a page with the camera or pick a photo; the page is found automatically (adjust the four corners if needed), straightened, cleaned up in colour or crisp black and white, and saved with the other pages as one PDF.
- Files can now be dropped onto tools, and pages dragged to reorder, on Windows too.

## 0.9.0 — 2026-10-06

- **Class game time** (teachers): open chosen games for one of your classes for 5–30 minutes, even during your lesson. Students see them within a minute; exams still lock games, and it doesn't count towards their daily time.
- **Typing Tutor** (Brain breaks, learning): eight lessons that add keys row by row with the next key highlighted, then a one-minute speed test in English, French (AZERTY) or Kinyarwanda. Personal best in words per minute.
- **Student exceptions** set by the school in NGA MIS → Desktop tools: a student's games can be paused until a date, or given extra daily minutes.
- Games now check the school's rules every minute (was 5).

## 0.8.0 — 2026-10-06

- **Brain breaks** (students and staff): 15 short games and 2 calm-down activities, all offline.
  - **Logic:** Number Place and Picture Logic (a shared daily puzzle for the whole school), Lights Out, Mines, Sliding Tiles, Merge to 2048, Code Breaker.
  - **Memory, words and maths:** Pairs (elements, English ↔ Kinyarwanda, capitals, shapes; 1–2 players), Echo, Five-Letter Guess (English, French, Kinyarwanda), Word Search (subject words), Math Sprint (S1–S6).
  - **Together and reflex:** Four in a Row (a friend or the computer), Snake.
  - **Culture:** Igisoro, switched on once a super admin approves its rules in NGA MIS.
  - **Breathe** and **Stand & Stretch**: always available, never counted.
  - **The school stays in control** (NGA MIS → Desktop tools): games pause during your own lessons and exams, rest at night, and students have a daily budget (learning games count half) and short sessions followed by a movement break. Every game saves itself, so a pause never loses anything. Personal bests only: no leaderboards, no streaks.

## 0.7.0 — 2026-10-06

- **Study kit** (everyone, offline):
  - **Graphing calculator**: several functions, sliders for letters like a and b, zeros and intersections marked, drag and zoom, save as PNG.
  - **Periodic table**: all 118 elements (PubChem data) with details, search, and a **molar mass calculator** (brackets and hydrates: Ca(OH)2, CuSO4·5H2O) with mass percentages.
  - **Formula sheets**: 76 maths, physics, chemistry and biology formulas for S1–S6, beautifully typeset, searchable, with favourites.
  - **Flashcards**: spaced repetition (FSRS). Each card comes back just before you'd forget it. Make decks, paste many cards at once, study with keyboard shortcuts 1–4.

## 0.6.0 — 2026-10-06

- **Classroom kit** (for teachers and staff), with your NGA MIS class lists or your own lists:
  - **Name picker**: everyone gets a turn before anyone is picked twice, absent students are skipped, a short reveal.
  - **Group maker**: by group size or number of groups, keeps chosen pairs apart, copy as text.
  - **Noise meter**: how loud the room is, with an optional chime. The microphone level only: nothing is recorded or sent.
  - **Work-mode signs**: silent work, group work, hands up… and your own.
  - **Classroom screen**: timer, sign and noise meter together on the projector.
- **Whiteboard** (everyone): pen, highlighter, shapes, arrows, text, undo/redo, grid or dark background, save as PNG.
- **Grade calculator** (everyone): weighted averages, your school's grade bands, and what's needed on the rest to reach a target.

## 0.5.0 — 2026-10-05

- **Tooltips** on every title-bar button and app tab: a modern bubble with what the button does, a hint (unread count, timers running, the page an app is on) and its keyboard shortcut. They appear after a short pause, then instantly while you move along the bar. They float above the apps and never take focus or clicks.
- **My Day** (new tool): today's lessons, office hours, quizzes, meetings and events from NGA MIS and Task Mentor.
  - **Now** and **Next** cards with live countdowns, and a timeline in Kigali time.
  - Tabs for the coming week.
  - **Open** takes you to the item in its app; **Count down** starts a timer to it.
  - Works offline from the last update.

## 0.4.0 — 2026-10-05

- **NGA Tools open as a floating modal**, centred over the window (🔧, ⌘/Ctrl+⇧T or ⌘K). It has a launcher with search, keyboard navigation (↑↓ Enter Esc) and colour-coded tools. A tool opens in place and keeps its state when you close and reopen it.
- **Ask AI** (new): an assistant for teachers and staff, built on the AI services NGA MIS already uses. Answers stream in, with Markdown, tables and maths. It suggests prompts, lets you stop or regenerate, shows which service answered and how many messages are left today, and keeps your conversation. Emails and phone numbers are removed before anything is sent. Students get the AI Tutor later (after the staff pilot).
- **Dark theme**: neutral near-black colours that match NGA MIS and Task Mentor (no more navy cast).
- Fixed: hovering a blue button in the dark theme turned it dark grey with unreadable text ("Start focusing").
- Focus timer and date calculator: modern − / + steppers instead of tiny number spinners.

## 0.3.0 — 2026-10-05

- **NGA Tools** (title bar 🔧, ⌘/Ctrl+⇧T, or ⌘K): a side panel of everyday tools that works offline, in English, French and Kinyarwanda:
  - **Calculator**: scientific, DEG/RAD, fractions, units ("5 km to m"), memory, history.
  - **Timers**: countdowns and stopwatches with laps. They ring on time even with the panel closed or NGA minimised, and survive a restart.
  - **Focus timer**: work/break rounds. NGA's notifications wait during work phases; minutes focused today are recorded.
  - **Notes**: Markdown with #tags and $maths$; export to .md.
  - **Unit converter**, **Date calculator** (working days, Rwanda public holidays) and **QR codes** (link, text, Wi-Fi, contact; save PNG/SVG).
  - Any tool can **pop out** into a small window that stays on top, or **present** full screen on a projector.
  - Each person's notes and history are kept in their own space on the computer (shared lab PCs stay private); personal tools need NGA MIS sign-in.
  - Settings → Tools: language, and an optional system-wide shortcut (⌘/Ctrl+⇧Space).

## 0.2.5 — 2026-10-05

- A redesigned Update button in the title bar: a modern pill with a pulsing "new" dot; while updating it fills up with the progress.
- Settings → Updates: the "Restart & update" button stays readable while downloading (it was dimmed to near-invisible on the dark theme) and fills with the progress.

## 0.2.4 — 2026-10-05

- Updates are noticed sooner: NGA checks every hour (was 6 h), and when you come back to it after 30 minutes away.

## 0.2.3 — 2026-10-05

- One-click update: the title bar's Update button now downloads, installs and restarts right away (progress in the button), and NGA MIS's /apps page has "Update to X now". Not while a quiz or meeting is open.

## 0.2.2 — 2026-10-05

- Sign-in sync: signing out of NGA MIS is noticed again (MIS shows its sign-in form at "/" as well as "/login", and "/" wasn't recognised), so the other apps close by themselves, and the next sign-in signs Task Mentor, Tendo and Tupo in automatically, without opening them.
- macOS: NGA no longer quits when an app's first page can't load (no internet, server down).

## 0.2.1 — 2026-10-04

- macOS: the app is signed as a whole (ad-hoc), so a downloaded copy opens through System Settings → Privacy & Security → Open Anyway instead of being reported as "damaged". (A Developer ID signature, once configured, removes the warning.)

## 0.2.0 — 2026-10-04

### Updates and downloads

- In-app updates: NGA checks the NGA update service after start and every 6 hours, shows an Update pill in the title bar and a toast once per version, and installs on "Restart & update" in Settings (not while a quiz or meeting is open). Updates are signed; each check counts the install (random id, version) for the school's stats.
- Downloads from mis.amashuri.com/apps (detects Windows or macOS), counted per download; releases upload to NGA's server and go live with the Publish workflow.
- Windows: the app no longer freezes on the first app, and fullscreen no longer hangs (two deadlocks); new windows into the same app open as windows; the window fits small screens.
- macOS: the app's page comes back on top after fullscreen; banner clicks no longer guessed.

### v0.2: redesign, notifications from every app, one sign-in

- New look: app tabs in the title bar (macOS overlay title bar; frameless Windows with its own controls), sliding tab highlight, badges, compact icon tabs on narrow windows, focus mode (⌘⇧F).
- Light and dark themes. The default matches NGA MIS's own theme (per user); you can also pick Light, Dark or This computer.
- ⌘K command palette: apps, ~38 destinations across the four apps, recent pages, actions.
- Notification manager: OS banners, an inbox in a side panel, per-app badges, mute, Do Not Disturb, and Smart Focus (holds banners during a Tupo meeting or a Task Mentor quiz).
- Notifications from all four apps: Tupo natively. MIS, Tendo and Task Mentor through watchers on their own notification polls (Task Mentor replayed in the background).
- macOS: real notification permission prompt and click handling (UNUserNotificationCenter); links to OS notification settings; test banner.
- One sign-in: when MIS signs in, the other apps sign in in the background; when MIS signs out or switches account, they close; a spoke that shows its own sign-in page is signed in again.
- Google sign-in through the system browser (needs MIS PR #55).
- Browser behaviour: native `beforeunload` and `window.print()` on macOS, file drag and drop into pages, per-app zoom, background throttling off, closing the window keeps NGA running.

- First version of the desktop shell: one window hosting NGA MIS, Task Mentor, Tendo and Tupo as live sites.
- Sign in once in NGA MIS; spokes sign in through MIS's existing SSO login (no web-app changes needed).
- Native routing: app-switcher links switch tabs, outside links open the default browser, PDFs/blobs open in a popup.
- macOS: native `alert` / `confirm` / `prompt` (WKWebView drops them otherwise).
- Native print, downloads to ~/Downloads with "Show in folder", tray menu, ⌘/Ctrl+1…4 shortcuts.
- "Sign out of this computer": MIS logout (back-channel to every app) + wipe of the local browsing profile.
