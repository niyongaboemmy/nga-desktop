// Browser-capability probe, run INSIDE an NGA Desktop app webview (served by
// scripts/fake-apps.mjs at http://localhost:5173/probe with PROBE=1). It tests
// every web API the NGA apps use and POSTs the results to /probe-result, then
// hands over to probe-deep.js (real workloads: recording, WebRTC media, face
// detection, gesture-only APIs).
(async () => {
  const R = {};
  const t = async (name, fn) => {
    try {
      const v = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000))]);
      R[name] = v === undefined ? "ok" : v;
    } catch (e) {
      R[name] = "ERROR " + (e && (e.name + ": " + e.message)).slice(0, 120);
    }
  };
  const has = (o, k) => (o && k in o ? "yes" : "NO");

  // ── Media (Task Mentor proctoring, Tupo Meet / voice messages) ──
  await t("mediaDevices.getUserMedia", () => typeof navigator.mediaDevices?.getUserMedia === "function" ? "yes" : "NO");
  await t("mediaDevices.getDisplayMedia", () => typeof navigator.mediaDevices?.getDisplayMedia === "function" ? "yes" : "NO");
  await t("mediaDevices.enumerateDevices", async () => {
    const d = await navigator.mediaDevices.enumerateDevices();
    return d.map((x) => x.kind).join(",") || "(none before permission)";
  });
  await t("MediaRecorder", () => (typeof MediaRecorder === "function" ? "yes" : "NO"));
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"])
    await t("MediaRecorder.isTypeSupported " + m, () => (MediaRecorder.isTypeSupported(m) ? "yes" : "NO"));
  await t("RTCPeerConnection offer", async () => {
    const pc = new RTCPeerConnection();
    pc.createDataChannel("x");
    const o = await pc.createOffer();
    pc.close();
    return o.sdp.includes("m=application") ? "yes" : "odd sdp";
  });
  await t("AudioContext", async () => {
    const C = window.AudioContext || window.webkitAudioContext;
    const c = new C();
    const s = c.state;
    await c.close();
    return "yes (initial state " + s + ")";
  });
  await t("AudioContext.resume without a click", async () => {
    const C = window.AudioContext || window.webkitAudioContext;
    const c = new C();
    await c.resume();
    const st = c.state;
    await c.close();
    return st;
  });
  await t("Audio element autoplay with sound", async () => {
    // 0.2 s of a quiet 440 Hz tone, as a WAV data URL.
    const rate = 8000, n = 1600, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, str) => [...str].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, "data"); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * 440 * i) / rate) * 800, true);
    const a = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" })));
    a.volume = 0.05;
    await a.play();
    return "allowed";
  });
  await t("speechSynthesis voices", () => new Promise((res) => {
    if (!window.speechSynthesis) return res("NO");
    const v = speechSynthesis.getVoices();
    if (v.length) return res(v.length + " voices");
    speechSynthesis.onvoiceschanged = () => res(speechSynthesis.getVoices().length + " voices");
    setTimeout(() => res(speechSynthesis.getVoices().length + " voices (late)"), 2500);
  }));
  await t("SpeechRecognition", () => (window.SpeechRecognition || window.webkitSpeechRecognition ? "yes" : "NO"));

  // ── Clipboard, share, geolocation, permissions ──
  await t("clipboard.writeText (no click)", async () => { await navigator.clipboard.writeText("nga-probe"); return "allowed"; });
  await t("execCommand copy exists", () => (typeof document.execCommand === "function" ? "yes" : "NO"));
  await t("navigator.share", () => (typeof navigator.share === "function" ? "yes" : "NO"));
  // Not in CI: WebView2 answers with a permission flyout that then sits over the page.
  if (!new URLSearchParams(location.search).has("ci")) await t("geolocation.getCurrentPosition", () => new Promise((res) => {
    if (!navigator.geolocation) return res("NO");
    navigator.geolocation.getCurrentPosition(() => res("position ok"), (e) => res("error code " + e.code + " (" + e.message + ")"), { timeout: 4000 });
  }));
  for (const p of ["camera", "microphone", "geolocation", "notifications"])
    await t("permissions.query " + p, async () => (await navigator.permissions.query({ name: p })).state);

  // ── Notifications, push, service worker, PWA ──
  await t("Notification (bridge)", () => (window.Notification ? Notification.name + " permission=" + Notification.permission : "NO"));
  await t("PushManager", () => (typeof window.PushManager !== "undefined" ? "yes" : "NO"));
  await t("serviceWorker.register", async () => {
    if (!navigator.serviceWorker) return "NO serviceWorker";
    const r = await navigator.serviceWorker.register("/sw-probe.js");
    const ok = !!r;
    await r.unregister();
    return ok ? "registered" : "no registration";
  });
  await t("matchMedia display-mode standalone", () => (matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser"));
  await t("navigator.standalone", () => String(navigator.standalone));

  // ── Fullscreen, PiP, print, popups ──
  await t("fullscreenEnabled", () => String(document.fullscreenEnabled ?? document.webkitFullscreenEnabled));
  await t("pictureInPictureEnabled", () => String(document.pictureInPictureEnabled));
  await t("window.print (bridge on macOS)", () => (window.print.toString().includes("native") ? "native window.print" : "bridged"));
  await t("window.open popup", async () => {
    const w = window.open("about:blank", "_blank", "width=300,height=200");
    if (!w) return "BLOCKED (null)";
    await new Promise((r) => setTimeout(r, 800));
    try { w.close(); } catch (e) { /* ignore */ }
    return "opened";
  });

  // ── Storage, files, downloads ──
  await t("localStorage", () => { localStorage.setItem("p", "1"); return localStorage.getItem("p") === "1" ? "ok" : "NO"; });
  await t("indexedDB write/read", () => new Promise((res, rej) => {
    const q = indexedDB.open("nga-probe", 1);
    q.onupgradeneeded = () => q.result.createObjectStore("s");
    q.onerror = () => rej(q.error);
    q.onsuccess = () => {
      const db = q.result;
      const tx = db.transaction("s", "readwrite");
      tx.objectStore("s").put("v", "k");
      tx.oncomplete = () => {
        const g = db.transaction("s").objectStore("s").get("k");
        g.onsuccess = () => { db.close(); indexedDB.deleteDatabase("nga-probe"); res(g.result === "v" ? "ok" : "mismatch"); };
      };
    };
  }));
  await t("storage.estimate", async () => { const e = await navigator.storage.estimate(); return Math.round(e.quota / 1e6) + " MB quota"; });
  await t("cookies", () => { document.cookie = "nga_probe=1; path=/"; return document.cookie.includes("nga_probe=1") ? "ok" : "NO"; });
  await t("FileReader + Blob URL", () => new Promise((res) => {
    const b = new Blob(["hello"], { type: "text/plain" });
    const u = URL.createObjectURL(b);
    const r = new FileReader();
    r.onload = () => { URL.revokeObjectURL(u); res(r.result === "hello" && u.startsWith("blob:") ? "ok" : "NO"); };
    r.readAsText(b);
  }));
  await t("blob download (a[download])", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["NGA desktop probe: safe to delete"], { type: "text/plain" }));
    a.download = "nga-desktop-probe.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return "clicked (see ~/Downloads)";
  });

  // ── Network: SSE (MIS live views), beacon, WebSocket ──
  await t("EventSource (SSE)", () => new Promise((res, rej) => {
    const es = new EventSource("/sse");
    es.onmessage = (e) => { es.close(); res("received: " + e.data); };
    es.onerror = () => { es.close(); rej(new Error("SSE error")); };
  }));
  await t("sendBeacon", () => (navigator.sendBeacon("/beacon", "x") ? "queued" : "NO"));
  await t("fetch keepalive", async () => { const r = await fetch("/beacon", { method: "POST", body: "y", keepalive: true }); return "status " + r.status; });
  await t("WebSocket", () => (typeof WebSocket === "function" ? "yes" : "NO"));
  await t("navigator.onLine", () => String(navigator.onLine));

  // ── Compute: crypto, WebGL (TF.js / MediaPipe), WASM, workers ──
  await t("crypto.subtle.digest", async () => { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("x")); return d.byteLength === 32 ? "ok" : "NO"; });
  await t("crypto.randomUUID", () => (crypto.randomUUID ? "yes" : "NO"));
  await t("WebGL2", () => {
    const g = document.createElement("canvas").getContext("webgl2");
    if (!g) return "NO";
    const ext = g.getExtension("WEBGL_debug_renderer_info");
    return "yes " + (ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "");
  });
  await t("WebGPU", () => (navigator.gpu ? "yes" : "NO"));
  await t("WebAssembly SIMD", () => {
    // (module (func (result v128) v128.const i32x4 0 0 0 0))
    const bytes = new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,22,1,20,0,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11]);
    return WebAssembly.validate(bytes) ? "yes" : "NO";
  });
  await t("Worker (blob)", () => new Promise((res) => {
    const w = new Worker(URL.createObjectURL(new Blob(["onmessage=e=>postMessage(e.data*2)"], { type: "text/javascript" })));
    w.onmessage = (e) => { w.terminate(); res(e.data === 42 ? "ok" : "NO"); };
    w.postMessage(21);
  }));
  await t("OffscreenCanvas", () => (typeof OffscreenCanvas === "function" ? "yes" : "NO"));
  await t("BroadcastChannel", () => (typeof BroadcastChannel === "function" ? "yes" : "NO"));
  await t("requestIdleCallback", () => (typeof requestIdleCallback === "function" ? "yes" : "NO"));
  await t("Intl Kigali time", () => new Date().toLocaleString("en-GB", { timeZone: "Africa/Kigali" }));
  await t("document.visibilityState", () => document.visibilityState);
  await t("userAgent", () => navigator.userAgent);

  await fetch("/probe-result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(R) });
  document.body.insertAdjacentHTML("beforeend", "<pre>" + JSON.stringify(R, null, 2) + "</pre>");
  // The real-workload tests (scripts/probe-deep.js) add to the same results.
  window.__probe = R;
  const s = document.createElement("script");
  s.type = "module";
  s.src = "/probe-deep.js";
  document.body.appendChild(s);
})();
