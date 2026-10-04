// Real-workload probe, loaded by probe.js after the API checks. Where probe.js
// asks "is it there?", this does what the NGA apps do with it:
//
// - Tupo voice messages: record a tone in every format Tupo would pick, play
//   it back, upload it, and play the recordings other engines made
//   (scripts/fixtures/voice-*).
// - Tupo Meet / Task Mentor live proctoring: camera + mic → WebRTC → the far
//   side decodes frames and audio → meeting recording of the far side.
// - Task Mentor proctoring: the exact face-detection stack (MediaPipe Tasks
//   Vision with the wasm Task Mentor loads, TF.js WebGL + COCO-SSD) on a photo.
// - Gesture-only APIs (fullscreen, clipboard, screen share, popups): the page
//   waits for a real click, which scripts/probe-ci.mjs makes with the OS mouse.
// - Tupo Meet captions: SpeechRecognition.start() (last: on macOS without the
//   Info.plist key, this is what killed the app).
//
// ?ci=1 (set by fake-apps PROBE_CI=1) enables the tests that would prompt a
// person (camera, speech, clicks); without it they're skipped.
const R = window.__probe;
const CI = new URLSearchParams(location.search).has("ci");
const ENGINE = /Windows/.test(navigator.userAgent) ? "webview2" : "wkwebview";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
R.engine = ENGINE;

let posting = Promise.resolve();
const post = () =>
  (posting = posting.then(() =>
    fetch("/probe-result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(R) }).catch(() => {}),
  ));
const state = (s) => {
  R.__state = s;
  document.getElementById("probe-state").textContent = s;
  return post();
};

const t = async (name, fn, ms = 20000) => {
  await state("running: " + name);
  try {
    const v = await Promise.race([fn(), sleep(ms).then(() => { throw new Error("timeout after " + ms / 1000 + " s"); })]);
    R[name] = v === undefined ? "ok" : v;
  } catch (e) {
    R[name] = "ERROR " + String((e && (e.name + ": " + e.message)) || e).slice(0, 160);
  }
  await post();
};

const loadScript = (src) =>
  new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.crossOrigin = "anonymous";
    s.onload = res;
    s.onerror = () => rej(new Error("could not load " + src));
    document.head.appendChild(s);
  });

document.body.insertAdjacentHTML(
  "afterbegin",
  `<p>Deep probe: <b id="probe-state">starting</b></p>
   <button id="gesture" style="display:none;position:fixed;inset:0;width:100vw;height:100vh;font-size:28px;z-index:9;background:#2563eb;color:#fff;border:0">Click</button>`,
);

// ── Helpers ─────────────────────────────────────────────────────────────────
/** A test signal without any device: a tone, and a moving colour canvas. */
function syntheticStream({ audio = true, video = true } = {}) {
  const tracks = [];
  let ac, osc, timer;
  if (audio) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    osc = ac.createOscillator();
    osc.frequency.value = 440;
    const dest = ac.createMediaStreamDestination();
    osc.connect(dest);
    osc.start();
    tracks.push(...dest.stream.getAudioTracks());
  }
  if (video) {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 240;
    const g = c.getContext("2d");
    let f = 0;
    timer = setInterval(() => {
      g.fillStyle = `hsl(${(f++ * 12) % 360},80%,50%)`;
      g.fillRect(0, 0, 320, 240);
      g.fillStyle = "#fff";
      g.fillText(String(f), 10, 20);
    }, 33);
    tracks.push(...c.captureStream(15).getVideoTracks());
  }
  return {
    stream: new MediaStream(tracks),
    stop() {
      tracks.forEach((x) => x.stop());
      clearInterval(timer);
      osc?.stop();
      ac?.close();
    },
  };
}

async function record(stream, mimeType, ms, timeslice) {
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  rec.start(timeslice);
  await sleep(ms);
  rec.stop();
  await stopped;
  return new Blob(chunks, { type: rec.mimeType || mimeType });
}

/** Plays a recording the way Tupo does (an <audio>/<video> element). */
async function playback(url, kind = "audio") {
  const el = document.createElement(kind);
  el.muted = true;
  el.preload = "auto";
  el.src = url;
  await new Promise((res, rej) => {
    el.oncanplay = res;
    el.onerror = () => rej(new Error("media error " + (el.error && el.error.code) + " " + ((el.error && el.error.message) || "")));
  });
  await el.play();
  await sleep(600);
  const advanced = el.currentTime > 0.1;
  el.pause();
  const d = el.duration;
  return `${advanced ? "plays" : "STUCK"} (duration ${Number.isFinite(d) ? d.toFixed(1) + " s" : d}${kind === "video" ? ", " + el.videoWidth + "x" + el.videoHeight : ""})`;
}

async function decodes(blob) {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const b = await ac.decodeAudioData(await blob.arrayBuffer());
    return b.duration.toFixed(1) + " s";
  } finally {
    ac.close();
  }
}

const ext = (mime) => (/mp4/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : "webm");

// ── 1. Tupo voice messages ─────────────────────────────────────────────────
// Same order as Tupo's VOICE_FORMATS (apps/web/src/lib/voiceFormat.ts).
const VOICE_FORMATS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus"];
await t("voice: format Tupo picks", () => VOICE_FORMATS.find((m) => MediaRecorder.isTypeSupported(m)) || "NONE (Tupo records the browser default)");
for (const mime of VOICE_FORMATS.filter((m) => MediaRecorder.isTypeSupported(m) && !m.includes(";"))) {
  await t("voice: record + play " + mime, async () => {
    const src = syntheticStream({ video: false });
    const blob = await record(src.stream, mime, 2000, 250); // Tupo: start(250)
    src.stop();
    if (!blob.size) throw new Error("empty recording");
    const name = `voice-${ENGINE}.${ext(blob.type)}`;
    await fetch("/probe-upload?name=" + name, { method: "POST", body: blob });
    const url = URL.createObjectURL(blob);
    const played = await playback(url);
    let decoded;
    try { decoded = await decodes(blob); } catch (e) { decoded = "decode ERROR " + e.name; }
    return `${blob.type}, ${(blob.size / 1024).toFixed(1)} KB, ${played}, decodeAudioData ${decoded}`;
  });
}
// Recordings made by the other engine (and by Chrome), as a listener would receive them.
const fixtures = await fetch("/probe-fixtures").then((r) => r.json()).catch(() => []);
for (const f of fixtures)
  await t("voice: play recording from " + f, () => playback("/probe-fixtures/" + f, f.startsWith("meet") ? "video" : "audio"));

// ── 2. Camera / mic (prompts a person: CI only) ─────────────────────────────
let camera = null;
if (CI)
  await t("getUserMedia camera+mic", async () => {
    camera = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const v = camera.getVideoTracks()[0];
    const s = v.getSettings();
    return `granted: ${camera.getTracks().map((x) => x.kind + ' "' + x.label + '"').join(", ")} ${s.width}x${s.height}`;
  }, 15000);

// ── 3. WebRTC media loopback (Tupo Meet, Task Mentor live proctoring) ───────
await t("WebRTC media loopback (" + (camera ? "camera" : "synthetic") + " → far side)", async () => {
  const src = camera ? { stream: camera, stop() {} } : syntheticStream();
  const a = new RTCPeerConnection(), b = new RTCPeerConnection();
  a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate);
  b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate);
  const remote = new MediaStream();
  const got = new Promise((res) => (b.ontrack = (e) => { remote.addTrack(e.track); if (remote.getTracks().length === 2) res(); }));
  src.stream.getTracks().forEach((tr) => a.addTrack(tr, src.stream));
  await a.setLocalDescription(await a.createOffer());
  await b.setRemoteDescription(a.localDescription);
  await b.setLocalDescription(await b.createAnswer());
  await a.setRemoteDescription(b.localDescription);
  await got;
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.srcObject = remote;
  v.width = 160;
  document.body.appendChild(v);
  await v.play();
  await sleep(2500);
  let frames = 0, packets = 0;
  (await b.getStats()).forEach((s) => {
    if (s.type === "inbound-rtp" && s.kind === "video") frames = s.framesDecoded;
    if (s.type === "inbound-rtp" && s.kind === "audio") packets = s.packetsReceived;
  });
  // Meeting recording (Tupo useMeetRecorder) of what the far side receives.
  const meetMime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = await record(remote, meetMime, 2000, 1000);
  await fetch(`/probe-upload?name=meet-${ENGINE}.${/mp4/.test(rec.type) ? "mp4" : "webm"}`, { method: "POST", body: rec });
  // Older Safari only records MP4: keep one of those too, for the other engine to play.
  if (!/mp4/.test(rec.type) && MediaRecorder.isTypeSupported("video/mp4"))
    await fetch(`/probe-upload?name=meet-${ENGINE}.mp4`, { method: "POST", body: await record(remote, "video/mp4", 2000, 1000) });
  const state = a.connectionState + "/" + b.connectionState;
  a.close();
  b.close();
  src.stop();
  v.remove();
  if (!frames) throw new Error(`no video frames decoded (ice ${state}, ${v.videoWidth}x${v.videoHeight})`);
  return `${state}; far side decoded ${frames} frames ${v.videoWidth}x${v.videoHeight}, ${packets} audio packets; recorded ${rec.type} ${(rec.size / 1024).toFixed(0)} KB`;
}, 30000);
camera?.getTracks().forEach((x) => x.stop());

// ── 4. Task Mentor proctoring: face detection stack ────────────────────────
const face = new Image();
face.crossOrigin = "anonymous";
face.src = "/probe-face.jpg";
await face.decode().catch(() => {});
let vision = null;
await t("proctoring: MediaPipe FaceDetector (Task Mentor's JS + wasm 0.10.0, GPU)", async () => {
  vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm");
  const files = await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
  const det = await vision.FaceDetector.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    minDetectionConfidence: 0.5,
    minSuppressionThreshold: 0.3,
  });
  // VIDEO mode on a <video>, like Task Mentor (here: the photo as a video stream).
  const c = document.createElement("canvas");
  c.width = face.naturalWidth || 640;
  c.height = face.naturalHeight || 480;
  const g = c.getContext("2d");
  const timer = setInterval(() => g.drawImage(face, 0, 0), 50);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.srcObject = c.captureStream(10);
  await v.play();
  await sleep(500);
  let ts = performance.now();
  det.detectForVideo(v, ts++); // the first frame compiles GPU shaders
  const first = performance.now() - ts;
  const t0 = performance.now();
  let n = 0;
  for (let i = 0; i < 10; i++) n = det.detectForVideo(v, ++ts + performance.now()).detections.length;
  const ms = (performance.now() - t0) / 10;
  clearInterval(timer);
  det.close();
  if (!n) throw new Error("no face found in the test photo");
  return `${n} face(s) found, ${ms.toFixed(0)} ms per frame (first frame ${first.toFixed(0)} ms)`;
}, 60000);
await t("proctoring: TF.js WebGL backend + COCO-SSD", async () => {
  await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js");
  await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js");
  await tf.setBackend("webgl");
  await tf.ready();
  const model = await cocoSsd.load();
  await model.detect(face); // warm-up
  const t0 = performance.now();
  const found = await model.detect(face);
  const ms = performance.now() - t0;
  const classes = found.map((x) => x.class).join(",") || "nothing";
  if (!found.some((x) => x.class === "person")) throw new Error("no person found (" + classes + ")");
  return `backend ${tf.getBackend()}, found ${classes}, ${ms.toFixed(0)} ms`;
}, 90000);

// ── 5. Gesture-only APIs: wait for a real click (CI's OS mouse) ────────────
const btn = document.getElementById("gesture");
async function onClick(name, fn, ms = 15000) {
  btn.textContent = "Click: " + name;
  btn.style.display = "block";
  await state("awaiting-click: " + name);
  const clicked = await Promise.race([
    new Promise((res) => (btn.onclick = () => { btn.style.display = "none"; res(true); })),
    sleep(45000).then(() => false),
  ]);
  btn.style.display = "none";
  btn.onclick = null;
  if (!clicked) {
    R[name] = "SKIPPED (no click arrived)";
    return post();
  }
  // Called straight from the click, like the apps' buttons (the API needs the user activation).
  const run = fn();
  await t(name, () => run, ms);
}

if (CI) {
  await onClick("fullscreen (Task Mentor proctored quiz)", async () => {
    const before = `${innerWidth}x${innerHeight}`;
    const p = document.documentElement.requestFullscreen();
    await p;
    await sleep(2500); // the window animates into fullscreen; CI takes a screenshot here
    await state("in-fullscreen");
    await sleep(2500);
    const during = `${innerWidth}x${innerHeight}`;
    const el = !!document.fullscreenElement;
    const covers = innerWidth >= screen.width - 2 && innerHeight >= screen.height - 80;
    await document.exitFullscreen();
    await sleep(2000);
    const after = `${innerWidth}x${innerHeight}`;
    if (!el) throw new Error("fullscreenElement not set");
    if (!covers) throw new Error(`app view ${during} doesn't cover the screen ${screen.width}x${screen.height}`);
    return `before ${before}, fullscreen ${during} (screen ${screen.width}x${screen.height}), after exit ${after}`;
  }, 20000);
  await onClick("clipboard.writeText (from a click)", async () => {
    await navigator.clipboard.writeText("nga-desktop-probe");
    return "copied";
  });
  await onClick("window.open (from a click)", async () => {
    const w = window.open("/sse", "_blank", "width=400,height=300");
    if (!w) throw new Error("blocked");
    await sleep(1500);
    w.close();
    return "opened";
  });
  await onClick("getDisplayMedia screen share (Tupo Meet)", async () => {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const tr = s.getVideoTracks()[0];
    const st = tr.getSettings();
    s.getTracks().forEach((x) => x.stop());
    return `shared "${tr.label}" ${st.width}x${st.height}`;
  }, 20000);

  // ── 6. Tupo Meet captions (last: this is the one that could end the app) ──
  await t("SpeechRecognition start (Tupo captions)", async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return "not available (Tupo hides captions)";
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    const ev = [];
    r.onstart = () => ev.push("start");
    r.onaudiostart = () => ev.push("audiostart");
    r.onresult = () => ev.push("result");
    r.onerror = (e) => ev.push("error:" + e.error);
    r.onend = () => ev.push("end");
    r.start();
    await sleep(6000);
    try { r.stop(); } catch { /* already ended */ }
    await sleep(800);
    return "app still alive; events: " + (ev.join(", ") || "(none)");
  }, 15000);
}

await state("done");
document.body.insertAdjacentHTML("beforeend", "<pre>" + JSON.stringify(R, null, 2) + "</pre>");
