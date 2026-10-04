# Browser features of the NGA apps inside NGA Desktop

Do the browser features used by NGA MIS, Task Mentor, Tendo and Tupo keep working inside the desktop app, on both Windows and macOS?

| | |
|---|---|
| Date | 2026-10-04 |
| Engines | **Windows:** WebView2 (Edge 153 / Chromium). **macOS:** WKWebView (Safari 26.6) |
| Status | **Tested on both**, automatically, in the real engines, by the browser probe in CI. The macOS results were also checked on a real Mac |

## How it is tested

The probe runs on every change to the native code. It also runs on demand: **Actions → Browser probe → Run**.

Each run builds NGA Desktop on `windows-latest` and `macos-latest` (`.github/workflows/probe.yml`). It then runs inside the real app, against stand-in apps (`scripts/fake-apps.mjs`). Each job publishes a results table plus screenshots, recordings and logs as artifacts.

The probe has three parts:

1. **`scripts/probe.js`: API checks.** It asks for every browser API the four apps use, and checks it's there.
2. **`scripts/probe-deep.js`: real workloads.** It does what the apps actually do:
   - Records Tupo voice messages in every format Tupo would pick, then plays them back. It also plays recordings the other engine made (`scripts/fixtures`).
   - Sends camera and mic through WebRTC; the far side decodes frames and audio, and the meeting is recorded.
   - Runs Task Mentor's exact face-detection stack:
     - MediaPipe Tasks Vision, using Task Mentor's JavaScript with wasm 0.10.0 on the GPU;
     - TF.js on WebGL, with COCO-SSD;
     - on a test photo.
   - Calls the APIs that need a click (fullscreen, clipboard, popups, screen share) after a **real OS mouse click**.
   - Starts Tupo's caption speech recognition.
3. **The Tupo stand-in, while hidden behind another app.** It checks that the ringtone, sounds and meeting audio keep playing.

**Runner (`scripts/probe-ci.mjs`).** It runs the whole probe without a person:
- Gives WebView2 a fake camera and mic (`NGA_TEST_BROWSER_ARGS`; development builds only).
- Clicks with the OS mouse (Windows `SendInput`, macOS `CGEvent`).
- Takes screenshots.
- Detects crashes and hangs.
- Checks that downloads land.

## Results

✅ works · 🔧 was broken in the desktop, fixed · ⚠️ works with a limitation · 🖐 can't be automated; check by hand

| Feature (who uses it) | Windows (WebView2) | macOS (WKWebView) |
|---|---|---|
| **Camera + mic** (Task Mentor proctoring, Tupo Meet, voice notes) | ✅ stream 640×480 + audio (fake device) | ✅ API present; the macOS prompt has its purpose text. 🖐 A real camera needs a person to allow it |
| **WebRTC media** (Tupo Meet, live proctoring) | ✅ far side decoded 50 frames 640×480 and 127 audio packets | ✅ on a real Mac (35 frames, 126 packets). 🔧 The Local Network prompt had no explanation |
| **Meeting recording** | ✅ VP9/Opus WebM | ✅ VP9 WebM and MP4 |
| **Voice messages:** record, then play back | ✅ WebM and MP4 | ✅ WebM and MP4/AAC (real Mac) |
| **Voice messages:** play the other engine's recordings | ✅ plays macOS WebM, M4A and MP4 | ✅ plays WebM |
| **Face detection** (Task Mentor; MediaPipe on GPU) | ✅ 1 face, 24–35 ms per frame | ✅ 1 face, 7 ms per frame (real Mac) |
| **COCO-SSD** (Task Mentor) | ✅ finds the person. ⚠️ The CI VM has no GPU, so TF.js fell back to CPU (1.4–3.3 s per frame); it uses WebGL on real PCs | ✅ WebGL, 20 ms |
| **Fullscreen** (Task Mentor proctored quiz, e-learning) | 🔧 The whole window goes fullscreen (it used to fill only the app area), and comes back. ⚠️ **Open:** the app view stays 48 px short of the screen (720 of 768, a black strip where the taskbar was), even after a re-layout | 🔧 fullscreen 1024×768, and the app is back on screen afterwards |
| **Clipboard copy** (≈115 buttons) | ✅ | ✅ from a click (as in Safari) |
| **`window.open`** (MIS previews, reports) | 🔧 now a real window; it used to replace the page | 🔧 same |
| **Screen share** (Tupo Meet) | 🖐 the API is there; CI couldn't press the system picker | 🖐 the macOS picker and Screen Recording permission need a person |
| **Live captions** (Tupo Meet) | ⚠️ starts, then reports `audio-capture` (no mic on CI; Edge's speech service is untested) | 🔧 no crash (the purpose text was added earlier); macOS asks permission |
| **Sounds, ringtone and meeting audio while Tupo is hidden** | ✅ all three play | ✅ all three play (real Mac) |
| **Autoplay, AudioContext without a click** | ✅ | ✅ |
| **Notifications** (all four apps) | ✅ bridge; banners | ✅ native banners with click callbacks. 🔧 A wrong-click guess switched apps |
| **Web Push / service workers** | ❌ by design: hidden and off. MIS reminders still arrive through its bell | same |
| **Downloads** (blob, `a[download]`; ≈36 exports) | ✅ saved in Downloads | ✅ saved in Downloads |
| **Live updates** (SSE), `sendBeacon`, `fetch` keepalive, WebSocket | ✅ | ✅ |
| **Storage** (IndexedDB, localStorage, cookies) | ✅ 10 GB quota | ✅ 20 GB quota |
| **WebGL2, WebGPU, WASM SIMD, Workers, `crypto`** | ✅ | ✅ |
| **Print** | ✅ native | ✅ via the bridge |
| **Share sheet** (`navigator.share`) | ✅ present | ✅ |
| **Text-to-speech** (Tupo) | ⚠️ 0 voices on the CI server; desktop Windows ships voices | ✅ 68 voices |
| **Geolocation** (optional analytics only) | ⚠️ WebView2 shows its own Allow/Block flyout | ⚠️ denied (no location permission) |
| **Google sign-in, Google Calendar connect** | ✅ browser sign-in. Calendar opens in the browser; MIS needs **PR #60**, see below | same |
| **OS link schemes** (`webcal:`, `tg:`, `mailto:` …) | ✅ handed to the OS | ✅ |

**macOS CI-only failures.** The macOS CI VM has no audio device and no camera, and its permission dialogs go unanswered. So a few audio and WebRTC rows fail there, while the same tests pass on a real Mac. The table uses the real-Mac result.

## Bugs the testing found, and their fixes

| # | Bug | Effect | Fix |
|---|---|---|---|
| 1 | **Windows froze on the first app** (deadlock). Creating an app's WebView2 inside a WebView2 callback, such as the shell's `open_app` IPC, waits on a message loop that callback holds | No app ever loaded on Windows ("NGA MIS is taking a while") | `create_later()` creates app views on a worker thread (`webviews.rs`) |
| 2 | **Lock-order deadlock.** `relayout()` held the shell's lock while moving webviews. Off the main thread (the auth watcher, workers) those calls wait for the main thread, which was waiting for that lock | Windows "Not Responding" after a fullscreen request; could hit macOS at random | Window calls are made outside the lock everywhere; `window_size()` is read first |
| 3 | **Fullscreen on Windows** filled only the app area | Proctored quiz not truly fullscreen | Native fullscreen. ⚠️ **Still open:** a 48 px strip at the bottom. The view keeps the maximized window's height; a re-layout after the transition didn't fix it. Next to try: un-maximize before going fullscreen |
| 4 | **macOS after fullscreen.** WebKit puts the view back *under* the shell | Another app showed, and the quiz page took no clicks | Re-attach the app view on top after exit (`reparent`) |
| 5 | **`window.open` into the same app** switched tabs, which navigated the opener away | MIS "open in new tab" replaced the page; unsaved work was lost | `new_window_from()`: a window into your own app stays a window |
| 6 | **Banner-click guess.** Focusing NGA within 10 s of any banner switched to that banner's app | Jumped apps by itself; in a proctored quiz that counts as leaving the quiz | Off where macOS reports real clicks; Windows only within 6 s |
| 7 | **Window bigger than school laptops' screens** (1320×840 on 1366×768) | Off screen after fullscreen | `fit_window()`: sized to the work area, maximized on small screens, not re-centred |
| 8 | **No Local Network purpose string** | Unexplained macOS prompt in meetings | `NSLocalNetworkUsageDescription` |
| 9 | **Speech recognition purpose string** (earlier audit) | macOS kills the app when captions start | `NSSpeechRecognitionUsageDescription`; CI confirms the app stays alive |
| 10 | **MIS "Connect Google Calendar"** stayed on "Opening Google…" forever (the desktop sends Google to the browser) | Calendar couldn't be connected from the app | **MIS PR #60:** in the desktop, open it in the browser and wait for the link. Not merged yet |
| 11 | **Tupo voice messages** (earlier audit) | Recording failed where WebM isn't supported | Tupo PR #25 (deployed) |
| 12 | Calendar subscribe (`webcal:`), Telegram and similar schemes; service workers and Push; Google Calendar sent to the browser (earlier audit) | | `navigation.rs`, `bridge.js` |

## Known limits (same as a browser, or by design)

- **Hidden app: no recording, no AAC.** In an app that's not on screen, macOS WebKit pauses MP4/AAC playback and recording. People record and play voice messages with the app in front, so this doesn't come up.
- **Meeting recording in the background.** Tupo draws its recording with `requestAnimationFrame`, which stops while another NGA app is shown, just like a background browser tab. The audio keeps going.
- **Switching apps during a proctored quiz** counts as leaving the quiz, as switching browser tabs does. Smart Focus keeps banners quiet during quizzes.
- **Windows banners can't be clicked through.** Tauri's notification plugin doesn't report clicks, so NGA uses the 6 s rule above. Native toast activation is a possible improvement.

## Still for a person to try (needs real hardware or a human answer)

- [ ] A Task Mentor proctored quiz with a **real camera**, on a Windows laptop and a Mac.
- [ ] A Tupo meeting with **screen share** (system picker), and **live captions** on Windows (Edge's speech service).
- [ ] Merge **MIS PR #60**, then connect Google Calendar from the app.
