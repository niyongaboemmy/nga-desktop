# NGA Desktop

One native app for Windows and macOS that hosts every NGA web app in a single window:
**NGA MIS, Task Mentor, Tendo and Tupo**. Users sign in once, in NGA MIS.

The web apps are **not copied**. Each one runs live from its own site (`*.amashuri.com`)
in its own native webview, so a web deploy reaches desktop users on their next reload
and needs no desktop release.

```
┌ NGA ─────────────────────────────────────────────────────────────────────┐
│ ●●●  [MIS] [Task Mentor²] [Tendo] [Tupo⁵]   🔍 Search… ⌘K   ← → ⟳ │ 🔔 ☾ ⋯ ⚙ │  ← shell (React, local)
│────────────────────────────────────────────────────────────────────────────│
│                                                         │ Notifications    │
│        https://taskmentor.amashuri.com                  │  (side panel,    │  ← child webview per app
│        (real top-level page, first-party storage)       │   pushes the app)│    (Rust, src-tauri)
│                                                         │                  │
└──────────────────────────────────────────────────────────────────────────┘
```

Stack: **Tauri 2.12** (pinned; multi-webview `unstable` API) + **React 19 / Vite 8 / TypeScript**, Rust 1.85+.
Installers: `.exe` (NSIS, per-user) and `.msi` (school IT) for Windows; universal `.dmg` for macOS.

The full design, what was verified, and the roadmap are in [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## Run it

Prerequisites: Node 20+ (24 recommended), Rust via [rustup](https://rustup.rs). On macOS you also need the Xcode command-line tools. On Windows you need the MSVC build tools and WebView2 (preinstalled on Windows 10 and 11).

```bash
npm install
npm run tauri:dev          # the shell, loading the PRODUCTION sites
npm run tauri:dev:local    # the shell, loading the apps' local dev servers (5173/5174/3000/5194)
```

## Build an installer locally

```bash
npm run bundle             # all targets for this OS
npx tauri build --bundles app,dmg                               # macOS, this CPU only
npx tauri build --target universal-apple-darwin --bundles dmg   # macOS universal (needs both rust targets)
```

Output goes to `src-tauri/target/**/release/bundle/`. Local builds are **unsigned**:

- **macOS:** right-click the app → Open the first time.
- **Windows:** SmartScreen shows "More info → Run anyway".

Signing is set up in CI (see [docs/RELEASING.md](docs/RELEASING.md)).

## Test

```bash
npm run typecheck && npm test -- --run     # shell UI (vitest)
npm run test:rust                          # registry + navigation rules (cargo test)
```

## Layout

| Path | What |
|---|---|
| `src-tauri/src/registry.rs` | The four apps: origins, start paths, public SSO client ids. Mirrors `NGA_APPS` in `nga_central_mis/frontend/src/components/apps/ngaApps.ts`. |
| `src-tauri/src/navigation.rs` | Where a URL may go: in place, another app's tab, a popup, or the system browser. Table-tested. |
| `src-tauri/src/webviews.rs` | The child webviews: create, switch, lay out, SSO entry, page-load guard, downloads, popups. The only file using Tauri's `unstable` API. |
| `src-tauri/src/dialogs.rs` | macOS: native `alert` / `confirm` / `prompt` / `beforeunload` (WKWebView drops them otherwise). |
| `src-tauri/src/bridge.js` | Injected into each app page: native-backed `Notification`, `setAppBadge`, `print`; notification watchers for MIS / Tendo / Task Mentor; MIS theme reporter. |
| `src-tauri/src/notifications.rs` | The notification manager: inbox, badges, routing (banner / toast / quiet), mute, Do Not Disturb, Smart Focus. |
| `src-tauri/src/os_notify.rs` | OS permission + delivery (macOS UNUserNotificationCenter with click handling; Windows toasts). |
| `src-tauri/src/auth.rs` | Central sign-in: background sign-in after MIS, close on MIS sign-out, re-sign-in of spokes. |
| `src-tauri/src/google.rs` | Google sign-in through the system browser (loopback; MIS side in `nga_central_mis` PR #55). |
| `src-tauri/src/menus.rs` | App menu bar, tray, native popup menus (tab, theme, more). |
| `src-tauri/src/commands.rs` | What the local shell UI may call (reload, print, sign out…). Remote pages get no IPC. |
| `src-tauri/capabilities/shell.json` | Grants those commands to the `shell` webview only. |
| `src/` | The shell UI: title bar with app tabs, ⌘K palette, notification panel, onboarding, settings, themes. |
| `.github/workflows/` | `ci.yml` (every PR), `build.yml` (unsigned test installers on demand), `release.yml` (tag `v*` → draft release). |

## Release

```bash
npm run release -- 0.2.0          # bumps versions, CHANGELOG, commits, tags v0.2.0
git push origin main --follow-tags
```

GitHub Actions builds the Windows and macOS installers into a **draft** release. Smoke-test them, then publish. Details are in [docs/RELEASING.md](docs/RELEASING.md).
