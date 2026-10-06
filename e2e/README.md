# UI tests (e2e)

The shell and tools run in a plain browser against the Vite dev server, with
Tauri's internals faked by `mock.js` (store, events, timers, overlay, the MIS API
proxy `tools_api`, file saves). Playwright drives WebKit (closest to macOS) and
Chromium (closest to WebView2).

```sh
npm run e2e              # every suite, both themes where a suite supports it
npm run e2e -- pdf ocr   # only those suites
```

`run-all.mjs` starts `vite` on port 1420 when nothing is running there, draws the
test pictures (`fixtures.mjs` → `.fx/`), runs `suites/*.mjs` and prints one
summary; it exits non-zero on any `FAIL`. Screenshots go to `shots/` (both
`.fx/` and `shots/` are gitignored).

- A suite prints one `PASS name — detail` / `FAIL name — detail` line per check.
  Suites listed in `THEMED` (run-all.mjs) take the theme as their first argument.
- The mock's MIS answers are controlled through localStorage set in an init
  script: `mock.persona` (student | teacher | …), `mock.policy` (open | lesson |
  exam | budget | quiet | off | igisoro | classtime | blocked), `mock.cap`
  (session minutes), `mock.signedOut`.
- What the page sent is exposed for assertions: `window.__saved` (files saved),
  `window.__usagePosts`, `window.__cgtPosts`, `window.__navigated`,
  `window.__lastQuery`.

These tests don't cover the native layer (windows, the real webview, pdf.js and
OCR workers on the app's own scheme). For that, build the self-test app:
`VITE_NGA_SELFTEST=1 NGA_ENV=development npx tauri build --debug --bundles app
--config src-tauri/tauri.dev.conf.json`, run it, and read
`~/Downloads/nga-tools-selftest.txt` (see `src/tools/selftest.ts`).
