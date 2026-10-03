# NGA Desktop — Implementation Plan (v2, refactored)

> **One** native app (`nga-desktop`) for Windows and macOS that hosts **all four** NGA web apps (NGA MIS, Task Mentor, Tendo, Tupo) in one window. The web apps stay where they are, online and deployed as today. The desktop app holds no copy of them.

| | |
|---|---|
| **Status** | v0.2 **built and running** (this repo): title-bar app tabs, themes, ⌘K palette, notification manager for all four apps, central and background sign-in, Google sign-in (with MIS PR #55). Remaining work: pilot hardening, signing and distribution. |
| **Date** | 2026-10-03 |
| **Supersedes** | `DESKTOP_APP_IMPLEMENTATION_PLAN.md` (v1, 2026-10-02) |
| **Repos** | `nga-desktop` (this repo, the only new project). Later, optional small PRs in `nga_central_mis`, `nga-task-mentor`, `nga-discipline-attendance` and `nga-communication-module` (§7, Phase 3). |
| **Pinned stack** | Tauri `=2.12.1` (+ `unstable` multi-webview), wry 0.57, React 19, Vite 8, TypeScript 6, Rust stable (built with 1.99), `tauri-action@v1` |

---

## 1. Summary

The v1 plan's architecture holds: a Tauri 2 shell, one native child webview per app (never an `<iframe>`), and MIS as the only identity provider. A working v0.1 was built and run against production, and checking the plan against the real code of the four apps and the Tauri/wry source changed several details. Some changes **remove** work. Others **fix bugs that v1 would have shipped**.

**Highlights:**

1. **No web-app change is needed for v0.1 sign-in.** MIS's existing `/login?client_id=…&redirect_uri=…` page already continues to the app on its own when the user is signed in. The spokes already accept a `state` they didn't start. The planned `/desktop/launch/:key` route is dropped.
2. **v1's navigation rule would have broken SSO.** It cancelled same-webview navigations to another NGA origin, and SSO is exactly such a redirect (spoke → MIS → spoke). In-place NGA↔NGA navigation is now allowed. Only *new-window* requests switch tabs.
3. **On macOS, `confirm()` / `alert()` / `prompt()` silently did nothing**, because wry doesn't implement those WebKit delegate methods. That affects about 80 call sites (delete confirmations and others) in MIS, Task Mentor and Tupo. **Fixed natively** in `dialogs.rs`.
4. **On macOS, the allow-list can't live in `on_navigation`**: WKWebView calls it for every iframe, so YouTube or Docs embeds would be thrown out to the browser. It moved to a main-frame page-load guard.
5. **Azure Artifact Signing can't sign for a Rwandan organisation**, so Windows signing uses an OV certificate in a cloud HSM.
6. CI and release were updated for `tauri-action@v1` (renamed inputs, workflow artifacts), Node 24 (npm-11 lock files), and signing/updater that switch on per secret.

---

## 2. What changed from v1, and why

| # | v1 said | v2 does | Evidence |
|---|---|---|---|
| C1 | New MIS route `/desktop/launch/:key` to mint SSO codes | **Dropped.** A spoke's first load goes to `https://mis.amashuri.com/login?client_id=<id>&redirect_uri=<spoke>/sso/callback&response_type=code`. | `Login.tsx` `handleAutoRedirect`: a valid session plus SSO params leads to `authorizeSSO`, then redirect (after a 1.5 s consent pause). Public client ids were confirmed in the live bundles: `taskmentor_app`, `discipline_attendance`, `tupo`. Each spoke's `ssoState.ts` accepts `no-state-stored`. |
| C2 | Another NGA origin in a webview → cancel and switch tab | **Allowed in place.** Only `target=_blank` / `window.open` to another app switches tabs. | SSO is a top-level redirect inside one webview. Cancelling it would make every first sign-in fail. |
| C3 | Allow-list enforced in `on_navigation` | `on_navigation` only filters schemes. The allow-list runs on **main-frame page-load start**; a disallowed page goes to the browser and the webview returns to its last good URL. | `wry-0.57.0/src/wkwebview/navigation.rs` calls the policy for every frame (no main-frame check). WebView2 calls it for the main frame only. |
| C4 | Not mentioned | **Native JS dialogs on macOS** (`dialogs.rs`) add `runJavaScript{Alert,Confirm,TextInput}Panel` to wry's delegate at runtime and answer with `NSAlert`. | Nothing in wry implements them, so `confirm()` returns `false`. Verified at runtime: the delegate now responds. |
| C5 | `on_new_window` → always `Deny` | **Popups for `blob:`, `about:blank` and NGA file hosts** (`NewWindowResponse::Create`), which share the session. A popup heading to an app or an outside site is routed and closed. | PDF previews and "open about:blank, then set its URL" (MIS `SystemsMenu` fallback) would otherwise break. |
| C6 | UA = default + `NGADesktop/x` | The full UA is built per OS. On macOS it adds the Safari `Version/x Safari/y` tokens that WKWebView's default UA lacks. | Some sites treat WKWebView's default UA as an unknown embedded browser. |
| C7 | Remote `apps.json` registry (D4) | **Deferred.** The registry is compiled in (`registry.rs`). | App content needs no desktop release anyway. A new app means a new origin, which needs a release under D4 too. |
| C8 | Staging environment | **Dropped.** Builds are `production` (default) or `development` (`NGA_ENV=development`, localhost ports). | No staging subdomains exist. |
| C9 | Windows signing: Azure Artifact Signing first | **OV certificate in a cloud HSM** (SSL.com eSigner, DigiCert KeyLocker, Certum). | Artifact Signing serves organisations in the US/CA/EU/UK and a few other countries. Rwanda is not listed. |
| C10 | `tauri-action@v0`, `includeUpdaterJson` | `@v1`, `uploadUpdaterJson`. Test installers via `uploadWorkflowArtifacts` (manual). | tauri-action 1.0.0 release notes (2026-06-29). |
| C11 | Node 22 in CI | **Node 24** (ships npm 11). | An npm-10 `npm ci` rejects lock files written by npm 11, a trap already hit on MIS deploys. |
| C12 | Updater key in `tauri.conf.json` | **Compiled from `NGA_UPDATER_PUBKEY`** at build time. Updater artifacts only when `TAURI_SIGNING_PRIVATE_KEY` exists. | The pipeline works on day one, before any key or certificate is bought. |
| C13 | "Sign out" via the MIS logout route | The shell runs `POST https://api.amashuri.com/auth/logout` **inside the MIS webview**, then wipes the shared profile (`clear_all_browsing_data`). | MIS has no `/logout` page route. The token stays in MIS's origin, so the shell never reads it. |
| C14 | Downloads via a custom `downloads.rs` | Engine defaults (both already save to `~/Downloads` with unique names). Rust only reports *finished*, and the shell shows "Show in folder". | wry `download.rs` (macOS) and WebView2's `ResultFilePath`. On macOS the finished path is always `None`, so "Show" opens the folder. |
| C15 | Shortcuts handled in the shell | **Native menu accelerators** (⌘/Ctrl+1…4, R, P, [, ]) plus the platform default menu. | Focus is usually inside an app webview, where shell key handlers never fire. On macOS the default Edit menu is what makes ⌘C and ⌘V work in webviews. |
| C16 | Build test installers on every push | **Manual** (`workflow_dispatch`). | macOS runner minutes are billed at a multiple of Linux minutes on private repos, and Actions billing failed on 2026-09-29. |

---

## 2b. Review 2: notifications, Google, layout, central sign-in, browser behaviour (v0.2)

### Notifications: what each app does today, and how they all reach the desktop

| App | Today (web) | In the desktop app (no app change needed) |
|---|---|---|
| **Tupo** | `new Notification(...)` when `document.hidden` and permission is granted (`context/NotificationContext.tsx`) | The bridge replaces `window.Notification` with a native-backed one. Hidden tabs report `document.hidden`, so Tupo's own rule decides. `onclick` runs when the notice is clicked. |
| **NGA MIS** | Bell polls `GET /notifications` every 45 s. Reminders use Web Push from a service worker, which doesn't work in embedded webviews. | **Watcher:** the bridge reads MIS's own `/notifications` responses and raises one desktop notice per new unread item. A click opens its `link` through the SPA router. |
| **Tendo** | `NotificationCenter` polls `GET /api/notifications` every 30 s | **Watcher**, same as MIS. |
| **Task Mentor** | `NotificationBell` polls `/dashboard/{student,instructor}/overview`, but **only while visible** | **Watcher + replay:** while Task Mentor is hidden, the bridge repeats its last overview request (same URL and headers, from its own origin) every 3 min. It notifies only for alerts the bell itself marks as worth a badge. |

The **notification manager** (`notifications.rs`):

- **Routing:** an OS banner when NGA isn't focused; a title-bar toast when NGA is focused on another app; nothing when the source app is on screen.
- **Inbox and badges:** every notice goes into the bell panel, with per-app filters. Tabs show badges from `navigator.setAppBadge` or the unread count, and the macOS Dock badge shows the total.
- **Quiet rules:** per-app mute (Settings, or right-click a tab), Do Not Disturb (1 h / until 08:00), and **Smart Focus**: banners from other apps wait while you're in a Tupo meeting (`/app/meet/:id`) or taking a Task Mentor quiz (`/quizzes/:id/take`, `/quiz/:id`). A pill in the title bar shows it.
- **Limits:** at most 12 per app per minute. Text is clipped. The source app comes from the webview label, never from the page.
- **The OS side** (`os_notify.rs`):
  - macOS installed app: `UNUserNotificationCenter`. It asks permission (system prompt), reports the status, stacks banners per app, and handles real click callbacks.
  - Windows: WinRT toasts. A click brings NGA back, and that counts as the click.
  - Settings → Notifications and the first-run strip show the OS status, plus **Allow**, **System settings** (`x-apple.systempreferences:…Notifications…?id=com.amashuri.nga.desktop` / `ms-settings:notifications`) and **Send a test**.
- **Background:** app webviews run with background throttling **disabled**. Closing the window **hides** it (setting "Keep running", on by default), so sockets and polls keep going. Quit from the tray or menu bar.

**Native path for the web apps (recommended, optional):** watchers depend on today's endpoint shapes. Each app can instead call the standard `new Notification(title, {body, tag})` and `navigator.setAppBadge(n)` when it has something new. Those work in browsers too, and the desktop picks them up with no watcher. Task Mentor should also poll when hidden in desktop (`isNgaDesktop()`).

### Google sign-in: through the browser, like Postman

Google's sign-in popup can't work inside an app window. Opened alone in a browser it is a blank `accounts.google.com/gsi/transform` page, because it needs its opener, and the app sent it there twice. So the app signs in to **MIS** in the person's normal browser, the way Postman's desktop app does, and gets back a one-time code (RFC 8252 loopback plus RFC 7636 PKCE). `browser_signin.rs` on the desktop side; MIS PR #55.

1. **In the app:** "Continue with Google (opens your browser)" links to `/desktop/signin`. If Google's own popup ever appears, it's caught too, and duplicates are dropped, so only one tab opens.
   - The app creates a PKCE verifier and its challenge, and listens once on `127.0.0.1:<random>`.
   - It opens the browser at `/desktop/signin?redirect_uri=…&state=…&challenge=…`.
2. **In the browser:** if it's already signed in to MIS, the person clicks **"Continue to the NGA app"**. That click is consent: it stops another local program from quietly taking the browser's session.
   - Otherwise the page **redirects straight to Google's own account chooser** (OpenID Connect `id_token`). No NGA page appears in between (MIS #57 and #58).
   - Google may only return to the registered site root, `https://mis.amashuri.com`. So the desktop request travels in Google's `state`, a one-time nonce is kept in sessionStorage, and MIS's `main.tsx` forwards Google's answer from `/` back to `/desktop/signin`.
   - There MIS signs in with the existing `POST /auth/google`.
   - MIS then issues a **one-time code**: a signed JWT, valid 2 minutes, used once, bound to the challenge.
   - It form-POSTs `{code, state}` to the loopback address only.
3. **Back in the app:** the MIS tab opens `/desktop/complete#code=…&verifier=…`. MIS redeems the code and runs its usual `completeLogin`, with the same gates as any login.

A code seen in a browser or a log is useless without the verifier, which never leaves the app.

**Verified:**
- MIS backend against the local DB: no session → 401; bad challenge → 400; wrong verifier → 400; redeem → 200 for the right user, with the cookie set; replay → 400.
- Headless Chrome 154 with the local MIS: already signed in → Continue → the loopback receives the code with matching state → the app redeems it and is signed in.
- Chrome accepts the `https` → `http://127.0.0.1` form POST without a warning.

**Needs:** MIS PR #55 deployed, frontend and backend. No migration, no new env var.

### One sign-in for everything (central and background sign-in)

`auth.rs` samples each app webview's URL every 1.5 s and acts on states that hold for 3 s. The apps are SPAs, so page loads don't show redirects.

- **MIS signed in:** every other app signs in **in the background** (hidden webviews running MIS's SSO hop, 1 s apart). They're ready, and their notifications flow. A spoke tab parked on MIS's sign-in page is pushed through again.
- **MIS signed out** (logout, expiry, account switch): the other apps' tabs close and their handshakes are forgotten. Back-channel logout has already ended their server sessions.
- **A spoke shows its own signed-out page while MIS is signed in:** its SSO hop runs again, at most once a minute.
- **Signing out anywhere signs out of NGA.** The apps' own "Sign out" buttons only sign out that app and load its sign-in page, so NGA would just sign it back in.
  - When a signed-in app loads its own sign-in page while MIS is signed in, NGA treats it as a sign-out of everything.
  - "Signing you out…" shows while MIS logs out (which ends every app's session through back-channel logout) and the other apps close, until MIS's sign-in page is back. Settings → "Sign out of this computer" uses the same screen and also wipes the profile.
- **One sign-in form:** while signed out, the other apps' tabs show "Sign in with NGA MIS" and never MIS's form inside their own tab. Once MIS is signed in, they sync behind their loading screens. MIS counts as signed in after 3 s of steady state.
- **The handshake stays out of sight:** a spoke's tab is shown only once it is on its own signed-in page. MIS's sign-in screen and the app's "verifying" page stay behind the loading screen.
  - Apps switch pages in client code, so the watcher (every 400 ms) notices when the app lands.
  - The tab is shown anyway after 4 s on a sign-in form (the person must act), or after 20 s.
- **The MIS tab:** if someone signs in to MIS from inside a spoke's tab, the MIS tab leaves its login page too.

The signed-out pages are configured per app in `registry.rs`: Task Mentor `/login`, Tendo `/`, Tupo `/`, MIS `/login` without `client_id`.

### Layout and interaction (redesign)

- **Title-bar app tabs:**
  - macOS: overlay title bar with the traffic lights.
  - Windows: frameless, with drawn minimise / maximise / close.
  - A sliding highlight marks the active tab. Each tab shows a badge and a "signed in" dot, and right-click opens a native menu (reload, start page, open in browser, mute).
  - Below 1100 px the tabs collapse to icons.
  - **Focus mode** (⌘⇧F) leaves a 30 px bar.
- **The ⌘K palette floats over the app:** it's a separate transparent window glued to the main window (`overlay.rs`), which dims the app behind it and closes on Esc, a click outside, or losing focus. Native app views draw above the shell's HTML, so an in-page overlay can't sit on top of an app.
- **Panels push the app instead of covering it:**
  - Notification side panel (360 px).
  - Onboarding strip.

  Native app views always draw above the shell, so any overlay would be hidden. Native popup menus serve the theme picker, "more" and the tab menu.
- **One theme everywhere, both ways** (`theme.rs`, bridge.js, plus a small listener in each app):
  - The source of truth is the account's `preferred_theme` in MIS. Task Mentor and Tupo already save their switches there, and Tupo pulls it back.
  - **Switching in the shell** pushes the theme to all four apps as a window `nga:set-theme` event, and MIS saves it to the account.
  - **Switching inside an app** is seen by the bridge, which watches `html.dark` or Tendo's `data-theme`. The shell follows, and the other apps get it pushed. MIS saves it whenever the switch started outside MIS, which covers Tendo, whose own switch is local only.
  - **Every page load** receives the current theme.
  - **Each app applies it through its own React state**, so its theme button stays right, and calls `preventDefault`. For older app versions, the bridge sets the app's storage key and `<html>` marker itself.
  - **No loops:** equal values are ignored.
  - App PRs: MIS #59, Task Mentor #24, Tendo #42, Tupo #24, deployed 2026-10-04. Verified on the live sites (each handles the event and switches) and end to end with the stand-in apps (Tendo switched → shell → MIS, Task Mentor and Tupo followed within about 2 s).
  - Options: My NGA account (default), Light, Dark, This computer. Window chrome follows, and the theme is restored before first paint.
- **Motion:** tab highlight slide, badge pop, panel slide-in, palette drop, toast drop-in, breathing splash with progress shimmer. All of it respects `prefers-reduced-motion`.

### Testing notifications without real accounts

`npm run fake-apps`, then `npm run tauri:dev:fake`. The first serves stand-ins for the four apps on their dev ports. They behave like the real ones: the MIS SSO hop, MIS and Tendo bell polls, Task Mentor polling only while visible, and Tupo's `new Notification` when hidden. Each produces a new item every 20 s. The app log shows `[app] notification #n -> Banner|Toast|Seen|Quiet` and `[app] badge n`.

Run on 2026-10-03, every path was verified:
- MIS and Tendo watchers fired; their old items were skipped on first load.
- Task Mentor's alerts arrived.
- Tupo's page reported `document.hidden = true`, `permission = granted`, the native-backed `Notification`, then its banners and badge, with the page's own `onclick` running on click.
- Background sign-in of all three spokes worked through the SSO hop.

The run also found and fixed one bug: when NGA reopened on another app, MIS was never loaded, so nothing signed in in the background. MIS is now always loaded (hidden) at start.

### Everyday app features

- **Keyboard:**
  - Ctrl+Tab / Ctrl+⇧+Tab cycle apps.
  - ⌘1…4 jump to an app.
  - ⌘K opens search.
  - ⌘⇧C copies the page link.
  - ⌘/ shows every shortcut in a floating sheet.
- **Window and tabs:**
  - The window title follows the page ("Tupo — Chat"): Dock, taskbar, Alt+Tab.
  - Tabs show the current page title on hover.
  - An "Offline" pill appears without a connection, and an app that didn't load retries when the connection is back.

### Browser behaviour checked

| Behaviour | Status in the desktop app |
|---|---|
| `alert` / `confirm` / `prompt` | macOS: added natively (wry lacks them). Windows: native. |
| `beforeunload` "leave page?" (MIS lesson-note editor, Tendo register) | macOS: added (`_webView:runBeforeUnloadConfirmPanel…`). Windows: native. |
| `window.print()` | macOS: bridged to native print. Windows: native. Plus ⌘P and the "more" menu. |
| File drag and drop into pages (uploads, chat) | Fixed: Tauri's own drop handler is disabled on app webviews (it swallowed drops). |
| Element fullscreen (`requestFullscreen`: e-learning, proctoring) | macOS: enabled by wry. Windows: fills the app area only, not the screen (to do: `ContainsFullScreenElementChanged` → window fullscreen). |
| Autoplay with sound (Tupo ringtones, TM warnings) | Allowed (wry `autoplay`). |
| Zoom | ⌘= / ⌘- / ⌘0, per app. |
| Camera / mic | OS prompt (Info.plist strings). WebKit grants per page. |
| Screen share (Tupo Meet) | macOS 14+. To test on 13. |
| Clipboard `writeText` | Works on click (user gesture). |
| `navigator.share` (Tupo feed / meet) | May be missing on WKWebView. Tupo already falls back to copying the link. |
| Geolocation (activity tracking) | Not granted (no location entitlement). The activity module already handles the error. |
| Web Push / service workers | Not used in desktop. Replaced by watchers and the bridge. Phase 3: skip SW registration when `isNgaDesktop()`. |
| `window.close()` from a popup | Not supported yet (wry lacks `webViewDidClose:`). Popups close with their window button. |
| Saved passwords / autofill | WebView2 autofill on. WKWebView has no Keychain autofill (the password + OTP form still works). |

---

## 3. Architecture (as built)

```text
┌──────────────────────────── window "main" (tauri::Window, multi-webview) ──────────────────────────────┐
│ webview "shell" (tauri://localhost, React)      │ webview "app-<key>" — one per app, created lazily     │
│  Sidebar · Header · Splash/Offline · Settings   │  top-level https://<app>.amashuri.com, first-party    │
│        │ invoke (shell.json capability only)     │  storage; hidden while not active / not yet loaded    │
│        ▼                                         │  NO IPC (no capability targets these webviews)        │
│  Rust: commands.rs → webviews.rs ◄── events ── on_page_load / on_new_window / on_download / title      │
│        registry.rs (apps)   navigation.rs (rules)   dialogs.rs (macOS JS dialogs)                       │
│        plugins: single-instance · window-state · store · opener · log · notification · process ·       │
│                 updater (only when NGA_UPDATER_PUBKEY was set at build)                                 │
│        native menu (Apps ⌘1…4, Go: back/forward/reload/print/open in browser) · tray menu               │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Layout:** the shell reports its sidebar/header insets (`set_insets`) whenever they move. Rust computes the app rect from the window size on every resize (no lag waiting for the shell). A shell page over the app area (Settings) calls `set_covered(true)`, which hides the app webview: native webviews always draw above the shell's HTML.
- **Profile:** all webviews share the default data store, so MIS cookies and localStorage are visible to the SSO hop of every spoke and survive restarts.
- **Security:** CSP on the shell. Every command sits behind an app-manifest permission (`build.rs`) granted only to `"webviews": ["shell"]`. Production builds trust only `https://*.amashuri.com` as top-level pages. Logs strip query strings (no SSO codes in log files).

---

## 4. Sign-in and sign-out (as built)

```text
first open of Tendo (no handshake in the last 20 h)
  app-tendo → https://mis.amashuri.com/login?client_id=discipline_attendance&redirect_uri=https://tendo.amashuri.com/sso/callback&response_type=code
     ├─ MIS session valid → consent screen 1.5 s → authorizeSSO → https://tendo.amashuri.com/sso/callback?code=…
     │                                  └─ Tendo exchanges the code server-side → signed in
     └─ not signed in → MIS password + OTP in that tab → same redirect
  Rust sees …/sso/callback?code= finish → stores sso.tendo = now (session.json)
later opens (< 20 h)  → https://tendo.amashuri.com/  directly (its own 24 h token is still valid)
```

- **Why 20 h:** MIS JWTs last 24 h. Re-running the hop before then means users essentially never land on a spoke's signed-out page.
- **Sign out of this computer** (Settings):
  1. A JS call inside the MIS webview: `POST /auth/logout` with MIS's own token. MIS bumps `token_version` and sends back-channel logout to every spoke.
  2. Wait 1.5 s.
  3. `clear_all_browsing_data`.
  4. Close all app webviews and forget the handshakes.
  5. Reopen MIS on its login page.
- **Reset NGA** wipes the profile without the server call. Use it for troubleshooting.
- **Signing out in MIS itself** works unchanged (back-channel + `/verify-mis` polling in the spokes).
- **Google sign-in:**
  - Google refuses OAuth in embedded webviews (`disallowed_useragent`).
  - The GIS popup is routed to the system browser, so the result never returns to the app.
  - Until Phase 3, Google-only users can't finish a Google sign-in inside the app. Workarounds: password + OTP, or "Open in browser".
  - Phase 3 hides the button in desktop; Phase 4 adds the system-browser handoff.

---

## 5. Navigation rules (as built, `navigation.rs`, table-tested)

| Request from an app webview | Result |
|---|---|
| Any frame, `http(s)`, `about:`, `blob:`, `data:` | allowed at frame level (iframes keep working) |
| Any frame, `mailto:` / `tel:` / `sms:` | handed to the OS |
| Any frame, `file:`, `javascript:`, custom schemes | blocked |
| **Main frame** on an NGA app origin or `https://*.amashuri.com` | loads in place (this is how SSO works) |
| **Main frame** anywhere else | opens in the default browser; the webview goes back to its last good URL |
| New window → another NGA app (MIS Apps menu, Tupo AppsSwitcher) | switches to that app's tab and loads the URL there (keeps `?code=`) |
| New window → same NGA app | loads in that app's tab |
| New window → `blob:`, `about:blank`, other `*.amashuri.com` | real popup window sharing the session; re-routed if it heads elsewhere |
| New window → any other `http(s)` | default browser |

---

## 6. Platform matrix (verified against wry 0.57 / Tauri 2.12.1)

| Capability | Windows (WebView2) | macOS (WKWebView) | Status |
|---|---|---|---|
| First-party cookies and localStorage, persistence | ✅ | ✅ | done |
| `alert` / `confirm` / `prompt` / `beforeunload` | ✅ native | ❌ in wry → **fixed** (`dialogs.rs`) | done, needs manual click-through test |
| Camera / microphone | ✅ prompt | wry grants media capture by default, so the OS prompts; `Info.plist` strings and entitlements are in the repo | Info.plist done; test proctoring and Meet |
| Screen share (`getDisplayMedia`) | ✅ | works on macOS 14+ (wry fix 0.35.1) | test Tupo Meet on 13/14/15 |
| Downloads | engine default → Downloads | wry → Downloads, de-duped | done (+ "Show in folder") |
| Print | `Webview::print` | `printOperationWithPrintInfo` | done (header button, ⌘/Ctrl+P) |
| `window.print()` from the page | ✅ | ignored by WKWebView → bridged to native print | done |
| File upload `<input type=file>` | ✅ | ✅ (wry open panel) | — |
| ⌘C / ⌘V | ✅ | needs an Edit menu → default menu kept | done |
| Service worker / Web Push | partial | unreliable | replaced by the notification manager (§2b); Phase 3: skip SW in desktop |
| Google OAuth in webview | ❌ | ❌ | system browser + loopback (§2b, MIS PR #55) |
| Tray, single instance, window state | ✅ | ✅ | done |
| Deep links `nga://` | — | — | not needed (Google uses loopback) |

---

## 7. Roadmap

Effort assumes one developer, who now starts from a working app.

### Phase 0 — Foundation ✅ (done 2026-10-03, this repo)

Repo, shell UI, registry, navigation rules, multi-webview manager, SSO via MIS login, macOS dialogs, popups, print, downloads, native and tray menus, sign out / reset, settings (start app, updates, about), CI (`ci.yml`), test installers (`build.yml`), release pipeline (`release.yml`), docs. The local unsigned macOS `.app` and `.dmg` build.

### Phase 1 — Pilot hardening (week 1–2)

| # | Task | Done when |
|---|---|---|
| 1.1 | Run **Test installers** in Actions; install the Windows `.exe` and `.msi` on Windows 10 and 11 | installs, runs and uninstalls cleanly |
| 1.2 | Run the manual checklist (§8.2) with a real staff account on both OSes | all rows pass, or issues are filed |
| 1.3 | Click-test `confirm`/`alert`/`prompt` in each app on macOS (e.g. delete a draft) | native dialog appears; OK and Cancel both behave |
| 1.4 | Proctoring (Task Mentor) and Meet with screen share (Tupo) on macOS + Windows | camera, mic and share work, or a fallback message is agreed |
| 1.5 | Popup behaviour: PDF/report previews in MIS and Task Mentor | preview opens in a popup and can be printed or saved |
| 1.6 | Pilot with 5–10 staff on unsigned builds | feedback triaged |

### Phase 2 — Signing, updates, distribution (admin-led; start now, it has lead times)

| # | Task | Owner |
|---|---|---|
| 2.1 | Apple Developer Program as an organisation (D-U-N-S, can take weeks), then the `APPLE_*` secrets | Admin |
| 2.2 | Buy an OV code-signing cert with a cloud HSM; add the vendor CLI + `signCommand` | Admin + dev |
| 2.3 | Generate the updater key, add the secrets and `NGA_UPDATER_PUBKEY`, back up offline | Lead |
| 2.4 | `downloads.amashuri.com`: nginx static block on the EC2 box + an upload job after publish (private repo) | Dev |
| 2.5 | Freeze the product name ("NGA") and the identifier `com.amashuri.nga.desktop` (**permanent** once shipped) | Product |
| 2.6 | Dry run: `v0.9.0` → install → `v0.9.1` → in-app update | Dev |

**Done when** a signed, notarized build installs with no Gatekeeper or SmartScreen block beyond the normal first-run prompt, and updates itself.

### Phase 3 — Desktop-aware web apps (small PRs, same change in all four repos)

The marker is the UA token `NGADesktop/<version>`. Copy one helper into each app:

```ts
export const isNgaDesktop = () => typeof navigator !== "undefined" && /\bNGADesktop\/\d/.test(navigator.userAgent);
```

| # | Change | MIS | TM | Tendo | Tupo |
|---|---|:-:|:-:|:-:|:-:|
| 3.1 | Hide PWA install UI (`AutoInstallPrompt`, `pwa/ngaInstall.tsx`, nudges). The Safari-like UA on macOS may otherwise show "Add to Dock" guidance. | ✅ | ✅ | ✅ | ✅ |
| 3.2 | Skip `serviceWorker.register` and Web Push subscription in desktop | ✅ | ✅ | ✅ | ✅ |
| 3.3 | ~~Hide the Google button~~ Google through the browser: **MIS PR #55** (merge + deploy) | ✅ | | | |
| 3.4 | Skip the 1.5 s SSO consent pause when `isNgaDesktop()` (faster first open of a spoke) | ✅ | | | |
| 3.5 | Hide the in-app app switchers (`SystemsMenu`, `AppsSwitcher`); the sidebar replaces them | opt. | opt. | opt. | opt. |
| 3.6 | Activity tracking: `client: "desktop"` and the version | ✅ | ✅ | ✅ | ✅ |
| 3.7 | `/download` page on MIS (reads `latest.json`), plus a "Get the desktop app" tile on Windows/macOS when not in desktop | ✅ | | | |

None of these block v1.0 except 3.1 (cosmetic) and 3.3 (affects Google-only users). Mind the npm-11 lock-file trap when these PRs add dependencies.

### Phase 4 — Native integration (after v1.0)

| # | Task |
|---|---|
| 4.1 | ✅ Done in v0.2: the bridge (runtime capability `remote-apps`) with `Notification`, `setAppBadge`, `print` and MIS theme, plus watchers. Next: apps adopt `new Notification` / `setAppBadge` natively. |
| 4.2 | ✅ Done in v0.2: Google through the system browser (loopback, MIS PR #55) |
| 4.3 | Autostart (setting), "kiosk/shared PC" mode that wipes the profile on quit |
| 4.4 | Backlog: Task Mentor exam lockdown, Linux row, macOS `.pkg` for MDM, per-app zoom |

### v1.0 gate

Phase 1 is complete, Phase 2 items 2.1–2.6 are done, and 3.1 and 3.3 are merged. Then publish v1.0.0 to `mis.amashuri.com/download` and the IT pack (`msiexec /i NGA.msi /qn`).

---

## 8. Testing

### 8.1 Automated (in CI on every PR)

- `cargo test`: registry (production origins are https and `*.amashuri.com` only, the SSO entry URL, the dev base path) and navigation (frame, main-frame and new-window tables).
- `vitest`: the shell's app-state reducer (splash vs busy bar, slow detection, sign-out reset).
- `clippy -D warnings` and `cargo fmt --check` on macOS + Windows; `tsc` + build on Linux.

### 8.2 Manual release checklist (Windows 11 + Apple Silicon Mac, every release)

- [ ] Fresh install → opens on NGA MIS → sign in (password + OTP)
- [ ] Task Mentor, Tendo, Tupo open signed in without typing credentials (brief MIS consent screen on first open)
- [ ] MIS Apps menu → Task Mentor switches tab (no browser, no second window)
- [ ] External link (e.g. YouTube) opens the default browser; an embedded video still plays in the page
- [ ] Delete something with a confirmation → native dialog (macOS) → Cancel keeps it, OK deletes
- [ ] Export PDF + XLSX → files in Downloads → "Show" works
- [ ] Print a report card (header button and ⌘/Ctrl+P)
- [ ] Task Mentor proctored quiz: camera prompt, detection running
- [ ] Tupo Meet: camera + mic + screen share; realtime chat; sleep/wake reconnects
- [ ] Network off at start → "taking a while / offline" → network on → Try again recovers
- [ ] Settings → Sign out of this computer → every app signed out; restart → MIS login
- [ ] Restart while signed in → still signed in everywhere
- [ ] In-app update from the previous version (once the updater is on)
- [ ] First run: "Turn on" strip → macOS permission prompt → test banner appears
- [ ] Tupo message while another app is on screen → title-bar toast + Tupo badge; with NGA in the background → OS banner → click opens Tupo on that chat
- [ ] New MIS / Tendo notification (bell) → desktop notice → click opens its link
- [ ] Task Mentor alert arrives while Task Mentor is hidden (replay, ≤ 3 min)
- [ ] In a Tupo meeting: banners from other apps wait; the "In a meeting" pill shows
- [ ] Sign in to MIS → the other tabs get their "signed in" dot without being opened; MIS logout → they close
- [ ] Google: "Continue with Google (opens your browser)" → ONE browser tab → Google (or "Continue to the NGA app" if already signed in there) → back in NGA, signed in (after MIS #55 is deployed)
- [ ] Theme follows NGA MIS's toggle; the Appearance menu overrides it; restart keeps it, without a flash
- [ ] ⌘K → type "attend" → Enter opens Tendo's register
- [ ] Drag a file into the Tupo composer / an MIS upload box
- [ ] Close the window → NGA keeps running (tray / Dock) and still notifies
- [ ] Uninstall leaves no running process

---

## 9. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | Tauri `unstable` multi-webview changes or regresses | M | H | Exact pin `=2.12.1`; all use isolated in `webviews.rs`; upgrade deliberately with §8.2 |
| R2 | Runtime method injection in `dialogs.rs` breaks with a wry or WebKit change | L | M | `class_addMethod` never overrides; logs whether the delegate responds; covered by checklist row |
| R3 | WebKit differences in the apps (CSS, media, TF.js) | M | M | Phase 1 tests; fixes also help Safari web users |
| R4 | Google-only accounts can't sign in inside the app | M | M | Fixed once MIS PR #55 is deployed |
| R11 | A watcher breaks when an app changes its notification endpoint | M | M | Watchers are a fallback: move apps to `new Notification` / `setAppBadge` (§2b) |
| R12 | Background sign-in uses memory (four live webviews) | M | L | Setting to turn it off; hidden webviews are cheap compared to four browser tabs |
| R5 | Signing lead times (Apple D-U-N-S, cert vetting) | M | H | Start Phase 2 now; pilot on unsigned builds |
| R6 | Updater key lost or leaked | L | Critical | Offline backup; `release` environment with reviewers |
| R7 | Shared PCs leak sessions | M | H | "Sign out of this computer" wipes the profile; kiosk mode in 4.3 |
| R8 | Actions billing / macOS minutes | M | M | Test builds are manual; releases only on tags; local `npm run bundle` works |
| R9 | Registry drift vs `ngaApps.ts` | L | L | Same keys and origins; reviewed when an app is added |
| R10 | A spoke changes its client id or callback path | L | H | Ids live in one place (`registry.rs`, with a test); keep spokes' `VITE_SSO_CLIENT_ID` stable |

---

## 10. Decisions needed

| # | Question | Recommendation |
|---|---|---|
| Q1 | Name shown in the OS | **"NGA"** (as built) |
| Q2 | Bundle id (permanent) | `com.amashuri.nga.desktop` (as built) |
| Q3 | Repo visibility | **Private** + `downloads.amashuri.com` mirror (the updater already lists it first) |
| Q4 | Windows signing vendor | OV cert, cloud HSM (Artifact Signing ineligible) |
| Q5 | Brand icon | Today the MIS 512 px icon. Supply a 1024 px master for crisp macOS icons |
| Q6 | Google sign-in priority | Hide in desktop now (3.3); handoff after v1.0 unless many staff are Google-only |

---

## Sources

- Tauri 2.12.1 and wry 0.57.0 source (crates.io), read for `add_child`, `on_new_window`/`NewWindowResponse`, `on_download`, `print`, `clear_all_browsing_data`, the WKWebView navigation and UI delegates
- [tauri-action 1.0.0 release notes](https://github.com/tauri-apps/tauri-action/releases)
- [Tauri runtime-wry 2.11.0 notes: `on_new_window` changes](https://v2.tauri.app/release/tauri-runtime-wry/v2.11.0/)
- [Code signing options for Windows apps (Microsoft)](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options); [Artifact Signing eligibility discussion](https://learn.microsoft.com/en-us/answers/questions/5977141/azure-artifact-signing-trusted-signing-is-a-us-llc); [devclass, 2026-01](https://www.devclass.com/security/2026/01/14/code-signing-windows-apps-may-be-easier-and-more-secure-with-new-azure-artifact-service/4079554)
- [Google: OAuth in embedded webviews](https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/)
- [wry 0.35.1: macOS 14 screen-share permission fix](https://v2.tauri.app/release/wry/v0.35.1); [tauri#2338](https://github.com/tauri-apps/tauri/issues/2338)
- Internal: `nga_central_mis` `frontend/src/components/apps/ngaApps.ts`, `components/ui/appLaunch.ts`, `components/Login.tsx`, `api/auth.ts`; each spoke's `ssoState.ts` and SSO callback; `docs/SINGLE_SIGN_OUT.md`
