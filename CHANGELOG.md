# Changelog

All notable changes to NGA Desktop. Web app changes ship with the web apps, not here.

## Unreleased

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
