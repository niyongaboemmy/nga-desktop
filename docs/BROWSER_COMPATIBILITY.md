# Browser features of the NGA apps inside NGA Desktop

Do the browser features used by NGA MIS, Task Mentor, Tendo and Tupo keep working inside the desktop app?

| | |
|---|---|
| Date | 2026-10-04 |
| Engines | macOS: WKWebView (Safari 26.6 engine). Windows: WebView2 (Chromium, Evergreen) |
| Method | Source inventory of the four apps, a live probe inside the real macOS engine, a code review of the risky flows, and research for Windows |

## How this was checked

1. **Inventory.** Every browser API call in the four frontends, from `origin/main` and excluding tests:
   - MIS: `frontend/src`
   - Task Mentor: `client/src`
   - Tendo: `client/src`
   - Tupo: `apps/web/src`
2. **Live probe on macOS.** `scripts/probe.js` runs inside an NGA Desktop app webview, as the MIS app with the bridge injected. It exercises each API, not just its presence: it creates a WebRTC offer, writes to IndexedDB, receives an SSE event, runs a Worker, checks recorder formats, downloads a file and opens a popup.
   - To run it: `PROBE=1 node scripts/fake-apps.mjs`, then `npm run tauri:dev:fake`. The results are written to `probe-result.json`.
3. **Code review** of the flows a probe can't judge: OAuth popups, custom link schemes, recording formats, fullscreen, push, and print.
4. **Windows** expectations come from WebView2's documented behaviour. They still need a hands-on run (Phase 1 of the plan).

## Results

✅ works · 🔧 fixed by this audit · ⚠️ works with a limitation · ❌ not available (alternative given)

| Feature | Used by (where) | macOS (tested) | Windows (WebView2) | Status / what NGA Desktop does |
|---|---|---|---|---|
| Camera / microphone `getUserMedia` | Task Mentor proctoring (`useProctoring`, `ProctoringSetup`); Tupo Meet, voice messages | ✅ available, devices listed; macOS asks once (Info.plist strings) | ✅ permission prompt | ✅ |
| Screen share `getDisplayMedia` | Tupo Meet (`useMeetRoom.ts:899`) | ✅ available (macOS 14+) | ✅ current runtime | ✅. Test with a real meeting |
| Recording `MediaRecorder` | Tupo voice messages, meeting recording, mic test | ✅ WebM and MP4, audio and video | ✅ WebM | 🔧 **Tupo #25**: voice messages always asked for WebM, which older Safari can't record, so they failed. Now picks a supported format (MP4/AAC fallback). Meeting recording already had a fallback list |
| WebRTC `RTCPeerConnection` | Task Mentor live proctoring; Tupo Meet (Cloudflare SFU) | ✅ offer created | ✅ | ✅ |
| Audio `AudioContext`, sounds, ringtones | Task Mentor proctor warnings; Tupo sounds and ringtone | ✅ AudioContext starts and audio plays **without a click** (autoplay allowed) | ✅ (autoplay allowed by wry) | ✅. Better than a browser tab: a background Tupo can ring |
| Text-to-speech `speechSynthesis` | Tupo spoken notifications | ✅ 68 voices | ✅ | ✅ |
| Live captions `SpeechRecognition` | Tupo Meet captions (`useSpeechCaptions.ts`) | ✅ present | ⚠️ WebView2 exposes it but has no Google speech service, so captions report an error | 🔧 macOS: added `NSSpeechRecognitionUsageDescription`. **Without it, macOS kills the app when captions start.** Windows: Tupo's hook already treats it as unavailable on error |
| Clipboard `writeText`, `execCommand('copy')` | ~115 copy buttons (Task Mentor 100, MIS 8, Tupo 7) | ✅ on click (refused without one, as in Safari) | ✅ | ✅. All are click handlers |
| Share sheet `navigator.share` | Tupo feed, reels, meeting invite | ✅ macOS share sheet | ⚠️ absent in WebView2 | ✅. Tupo falls back to copying the link |
| Notifications `new Notification` | Tupo (own), MIS / Tendo / Task Mentor (bell polls) | ✅ native bridge | ✅ native bridge | ✅ see `notifications.rs` (watchers cover the bells) |
| Web Push `PushManager` + service worker | MIS reminders (`reminders/push.ts`) | ❌ no PushManager in WKWebView | ❌ no push service | 🔧 The bridge hides PushManager, so MIS takes its "no push here" path. **Reminders still arrive:** MIS puts every reminder in its bell (`notifyUser`), and the desktop's bell watcher turns it into a desktop notification (within MIS's 45 s poll) |
| Service workers | Install cards (Task Mentor, Tendo, Tupo); MIS PWA + push | ✅ would register | ✅ would register | 🔧 **Off in the desktop.** Pages are always online here, and a worker's cache is what kept old releases after deploys. Every app already handles a refused registration |
| PWA install prompts | All four (`ngaInstall.tsx`, `AutoInstallPrompt`) | n/a | n/a | 🔧 The bridge reports the installed display mode, so the prompts stay hidden |
| Fullscreen `requestFullscreen` | Task Mentor proctored quizzes and stream view (20); MIS e-learning and shared notes | ✅ true fullscreen (WebKit's own) | ⚠️ WebView2 fills only the app area | 🔧 Windows: the bridge reports `fullscreenchange`, and the window goes fullscreen with the app covering it |
| Picture-in-picture | — | ✅ | ✅ | not used |
| Print `window.print()` | MIS (5), Task Mentor report cards (3), Tendo (3) | ✅ via the native bridge (WKWebView ignores `window.print`) | ✅ native | ✅. Report cards print the main page, not the hidden iframe |
| Downloads (`a[download]`, blob, jsPDF / ExcelJS / docx / xlsx) | ~36 export buttons | ✅ file saved in ~/Downloads; "Show in folder" toast | ✅ | ✅ |
| File upload, drag and drop | ~40 drop zones and file inputs | ✅ native picker; drops reach the page | ✅ | ✅ (Tauri's own drop handler is off for app pages) |
| Popups `window.open` | MIS (8): previews, lesson notes, blob reports, systems menu | ✅ popup window shares the session | ✅ | ✅ NGA links switch tabs; blob/about:blank/NGA files open a popup; others go to the browser |
| Google sign-in | MIS login | browser sign-in (Postman-style) | same | ✅ see `browser_signin.rs` |
| Google Calendar connect | MIS Reminders → Channels (`googleConnectUrl`) | was routed to sign-in | same | 🔧 Only Google's sign-in popup (`/gsi/…`) starts the desktop sign-in. Other Google OAuth pages open in the browser, and MIS polls the link status (every 4 s) |
| Calendar subscription `webcal:`, Telegram `tg:`, `mailto:`, `tel:`, WhatsApp, Teams, Zoom | MIS Reminders (feed, Telegram); Tupo mail | `webcal:` was blocked | same | 🔧 Handed to the OS (Calendar, Telegram, Mail…) |
| Live updates `EventSource` (SSE) | MIS: course builder, AI studio, office-hours register, monitoring (14) | ✅ event received | ✅ | ✅ |
| WebSocket / socket.io | Task Mentor proctoring; Tupo realtime | ✅ | ✅ | ✅ (throttling off for hidden apps, so sockets stay connected) |
| `sendBeacon`, `fetch` keepalive | Activity analytics (all four) | ✅ both delivered | ✅ | ✅ |
| IndexedDB, localStorage, cookies | Tupo outbox; sessions everywhere | ✅ write/read; 20 GB quota; persists across restarts | ✅ | ✅ |
| WebGL2 / WebGPU / WebAssembly SIMD / Workers | Task Mentor TF.js + MediaPipe face detection | ✅ WebGL2 (Apple GPU), WebGPU, SIMD, Worker | ✅ | ✅. Check performance on low-end PCs |
| `crypto.subtle`, `randomUUID` | MIS | ✅ | ✅ | ✅ |
| Page visibility `visibilitychange` | All four (polling, proctoring) | ✅ hidden apps report `hidden` | ✅ | ✅. Switching NGA tabs during a quiz counts as leaving it, by design |
| `beforeunload` "leave page?" | MIS lesson-note editor, Tendo register, Task Mentor | ✅ native dialog (added) | ✅ | ✅ |
| `alert` / `confirm` / `prompt` | ~80 calls | ✅ native dialogs (added) | ✅ | ✅ |
| Geolocation | Activity analytics only (policy-gated) | ⚠️ never answers (no location permission) | ⚠️ Windows asks | ✅. Optional, and the apps carry on without it |
| `requestIdleCallback`, `userAgentData`, `navigator.connection` | MIS (guarded) | ❌ absent in WebKit | ✅ | ✅. All guarded by feature checks |
| Network status `navigator.onLine` | All four | ✅ | ✅ | ✅ (plus the shell's Offline pill) |

## Fixes made by this audit

| Fix | Where |
|---|---|
| Speech-recognition privacy description; without it macOS terminates the app when Tupo captions start | `src-tauri/Info.plist` |
| Google Calendar connect goes to the browser; only Google's sign-in popup starts the desktop sign-in | `navigation.rs` (`is_google_signin` now matches `/gsi/` only) |
| `webcal:`, `tg:`, `whatsapp:`, `facetime:`, `zoommtg:`, `msteams:`, `skype:` links open with the OS | `navigation.rs` (`os_scheme`) |
| Service workers off, Web Push hidden | `bridge.js` |
| Real fullscreen on Windows | `bridge.js` → `web_fullscreen` (`webviews.rs`) |
| Voice messages record in a supported format | Tupo PR #25, deployed |

## Still to verify by hand (needs a person, a camera or Windows)

- [ ] Task Mentor proctored quiz on macOS and Windows: camera prompt, face detection running, fullscreen enforced.
- [ ] Tupo Meet: camera, mic, **screen share** (macOS 13/14/15), recording, live captions (macOS).
- [ ] A voice message recorded on macOS plays on Windows and in Chrome (MP4/AAC or WebM).
- [ ] MIS Reminders: a lesson reminder appears as a desktop notification; "Subscribe in Calendar" opens Calendar; "Connect Google Calendar" completes in the browser and MIS shows it connected.
- [ ] Windows: run this probe (`PROBE=1 …`) once on a Windows PC and add the results to the table.
