# Changelog

All notable changes to NGA Desktop. Web app changes ship with the web apps, not here.

## Unreleased

- First version of the desktop shell: one window hosting NGA MIS, Task Mentor, Tendo and Tupo as live sites.
- Sign in once in NGA MIS; spokes sign in through MIS's existing SSO login (no web-app changes needed).
- Native routing: app-switcher links switch tabs, outside links open the default browser, PDFs/blobs open in a popup.
- macOS: native `alert` / `confirm` / `prompt` (WKWebView drops them otherwise).
- Native print, downloads to ~/Downloads with "Show in folder", tray menu, ⌘/Ctrl+1…4 shortcuts.
- "Sign out of this computer": MIS logout (back-channel to every app) + wipe of the local browsing profile.
