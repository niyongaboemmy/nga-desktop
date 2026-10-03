# Changelog

All notable changes to NGA Desktop. Web app changes ship with the web apps, not here.

## Unreleased

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
