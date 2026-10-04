#!/usr/bin/env node
// Stand-ins for the four NGA apps on their development ports, for testing the
// desktop shell end to end without real accounts:
//
//   node scripts/fake-apps.mjs        then, in another terminal:
//   npm run tauri:dev:fake
//
// They behave like the real apps in the ways the shell depends on:
// - MIS      :5173  /home (signed in), /login?client_id=… → the SSO hop
//                   (redirects to the spoke's callback with a code), polls
//                   GET /notifications every 5 s via XHR (like axios), html.dark/light
// - Task M.  :5174  /taskmentor/…; polls /dashboard/instructor/overview ONLY while
//                   visible (like the real bell), so the shell must replay it
// - Tendo    :3000  "/" = sign-in page; polls GET /api/notifications every 5 s with fetch
// - Tupo     :5194  /app/chat; raises `new Notification(...)` when hidden, like Tupo
//
// Each app produces a new item every ~20 s, so notifications keep arriving.
import http from "node:http";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const started = Date.now();
let misFirstRequest = 0;
// FAKE_SIGNOUT_TEST=1: Tupo's own "Sign out" is pressed 25 s after it opens;
// visiting MIS's /login then counts as signed out, and the person signs in
// again 15 s later.
let misLoggedOutAt = 0;
let faceJpg = null;
const tick = () => Math.floor((Date.now() - started) / 20_000); // a new item every 20 s
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const page = (title, body) =>
  `<!doctype html><html class="light"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:15px system-ui;margin:40px;color:#123}html.dark body{background:#0b1020;color:#e6ebf5}code{background:#8882;padding:2px 5px;border-radius:4px}</style>
<script>const out=(m)=>{const l=document.getElementById('log');if(l)l.textContent+=new Date().toLocaleTimeString()+' '+m+'\\n'};</script>
<script>
// Theme reporter (test aid): each app's current theme, every 3 s, to the Tupo stand-in.
setInterval(()=>{const r=document.documentElement;const t=location.port==='3000'?(r.getAttribute('data-theme')||'?'):(r.classList.contains('dark')?'dark':'light');
fetch('http://localhost:5194/__theme?port='+location.port+'&t='+t,{mode:'no-cors'}).catch(()=>{});},3000);
</script>
</head><body><h1>${title}</h1><pre id="log"></pre>${body}
</body></html>`;

const json = (res, data) => {
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" });
  res.end(JSON.stringify(data));
};
const html = (res, s) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(s);
};
const redirect = (res, to) => {
  res.writeHead(302, { Location: to });
  res.end();
};

// ── MIS :5173 ───────────────────────────────────────────────────────────────
http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost:5173");
    // PROBE=1: a capability probe runs inside the app (scripts/probe.js).
    // PROBE_CI=1 adds the tests that need a person (camera, clicks, speech): scripts/probe-ci.mjs.
    if (process.env.PROBE && url.pathname === "/home") return redirect(res, process.env.PROBE_CI ? "/probe?ci=1" : "/probe");
    if (url.pathname === "/probe") return html(res, page("Capability probe", `<p>Testing web APIs inside NGA Desktop…</p><script src="/probe.js"></script>`));
    if (url.pathname === "/probe.js" || url.pathname === "/probe-deep.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end(readFileSync(new URL("." + url.pathname, import.meta.url))); }
    // Recordings the probe makes (→ probe-out/), and ones other engines made (scripts/fixtures/).
    if (url.pathname === "/probe-upload") {
      const name = (url.searchParams.get("name") || "x").replace(/[^\w.-]/g, "");
      const parts = []; req.on("data", (c) => parts.push(c));
      req.on("end", () => { mkdirSync(new URL("../probe-out/", import.meta.url), { recursive: true }); writeFileSync(new URL("../probe-out/" + name, import.meta.url), Buffer.concat(parts)); log("PROBE upload", name); res.writeHead(204); res.end(); });
      return;
    }
    if (url.pathname === "/probe-fixtures") { let f = []; try { f = readdirSync(new URL("./fixtures/", import.meta.url)).filter((x) => /^(voice|meet)-/.test(x)); } catch { /* none */ } return json(res, f); }
    if (url.pathname.startsWith("/probe-fixtures/")) {
      const f = url.pathname.slice(16).replace(/[^\w.-]/g, "");
      const type = { m4a: "audio/mp4", mp4: "video/mp4", ogg: "audio/ogg", webm: f.startsWith("meet") ? "video/webm" : "audio/webm" }[f.split(".").pop()];
      try { const b = readFileSync(new URL("./fixtures/" + f, import.meta.url)); res.writeHead(200, { "Content-Type": type, "Content-Length": b.length, "Accept-Ranges": "bytes" }); return res.end(b); } catch { res.writeHead(404); return res.end(); }
    }
    // A portrait for the face-detection test (MediaPipe's own test asset), served same-origin.
    if (url.pathname === "/probe-face.jpg") {
      (faceJpg ??= fetch("https://storage.googleapis.com/mediapipe-assets/portrait.jpg").then((r) => r.arrayBuffer()).then((b) => Buffer.from(b)))
        .then((b) => { res.writeHead(200, { "Content-Type": "image/jpeg", "Access-Control-Allow-Origin": "*" }); res.end(b); })
        .catch(() => { res.writeHead(502); res.end(); });
      return;
    }
    if (url.pathname === "/sw-probe.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end("self.addEventListener('fetch',()=>{});"); }
    if (url.pathname === "/probe-bg") { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { probeBg = JSON.parse(b); log("PROBE background audio", b); } catch { /* bad */ } res.writeHead(204, { "Access-Control-Allow-Origin": "*" }); res.end(); }); return; }
    if (url.pathname === "/sse") { res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }); res.write("data: hello-from-sse\n\n"); return setTimeout(() => res.end(), 1500); }
    if (url.pathname === "/beacon") { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { log("MIS  beacon/keepalive received:", b); res.writeHead(204); res.end(); }); return; }
    if (url.pathname === "/probe-result") {
      let b = ""; req.on("data", (c) => (b += c));
      req.on("end", () => {
        // Merge in what the hidden Tupo stand-in measured (BG_AUDIO).
        try { b = JSON.stringify({ ...JSON.parse(b), ...probeBg }); } catch { /* keep as sent */ }
        writeFileSync(new URL("../probe-result.json", import.meta.url), b); log("PROBE RESULT saved"); res.writeHead(204); res.end();
      });
      return;
    }
    // FAKE_SIGNED_OUT_FOR=<s>: MIS starts signed out and "signs in" after that long.
    misFirstRequest ||= Date.now(); // counted from the app's first visit
    if (process.env.FAKE_SIGNOUT_TEST && url.pathname === "/login" && !url.searchParams.get("client_id") && !misLoggedOutAt && Date.now() - misFirstRequest > 5000) {
      misLoggedOutAt = Date.now();
      log("MIS  signed out (logout)");
    }
    if (misLoggedOutAt && Date.now() - misLoggedOutAt > 15000) {
      misLoggedOutAt = 0;
      log("MIS  the person signs in again");
    }
    const misSignedIn =
      !misLoggedOutAt && Date.now() - misFirstRequest >= Number(process.env.FAKE_SIGNED_OUT_FOR || 0) * 1000;
    if (url.pathname === "/__mis_state") return json(res, { signedIn: misSignedIn });
    if (url.pathname === "/login" && !misSignedIn) {
      log("MIS  sign-in form shown", url.searchParams.get("client_id") ? `(SSO hop for ${url.searchParams.get("client_id")})` : "");
      return html(res, page("NGA MIS sign-in (fake)", `<p>Signed out. Signing in…</p><script>
const back=${JSON.stringify(url.search)};
setInterval(()=>fetch('/__mis_state').then(r=>r.json()).then(j=>{ if(j.signedIn && !new URLSearchParams(back).get('client_id')) location.replace('/home'); }),1000);
</script>`));
    }
    if (url.pathname === "/home" && !misSignedIn) return redirect(res, "/login");
    if (url.pathname === "/login" && url.searchParams.get("client_id")) {
      // The SSO hop: signed in at MIS → straight back to the spoke with a code.
      const to = new URL(url.searchParams.get("redirect_uri"));
      to.searchParams.set("code", "fake-" + Math.random().toString(36).slice(2));
      log("MIS  SSO hop for", url.searchParams.get("client_id"));
      return redirect(res, to.href);
    }
    // Browser sign-in (FAKE_SIGNIN=1): the stand-in "browser page" hands a code
    // straight to the app's loopback; /desktop/complete then lands on /home.
    if (url.pathname === "/desktop/signin" && url.searchParams.get("redirect_uri")) {
      const to = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state");
      log("MIS  browser sign-in page: handing a code to", to, "in 3 s");
      setTimeout(() => {
        fetch(to, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: "fakecodexxxxxxxxxxxxxxx.payloadxxxxxxxxxxxxxxxxxxx.signaturexxxxxxx", state }) })
          .then((r) => log("MIS  loopback answered", r.status)).catch((e) => log("MIS  loopback failed", e.message));
      }, 3000);
      return html(res, page("NGA (fake browser sign-in)", "<p>Signing you in… you can close this tab.</p>"));
    }
    if (url.pathname === "/desktop/complete") {
      log("MIS  /desktop/complete (redeeming)");
      return html(res, page("Signing you in", "<p>Redeeming…</p><script>setTimeout(()=>location.replace('/home'),2500)</script>"));
    }
    if (url.pathname === "/notifications") {
      const n = tick();
      const data = Array.from({ length: n + 1 }, (_, i) => ({
        notification: {
          notification_id: 100 + i,
          title: i === 0 ? "Welcome to NGA MIS" : `Document shared with you #${i}`,
          body: i === 0 ? "Old item: must NOT notify" : "Scheme of Work – Term 2 was shared with you.",
          link: "/documents",
          read_at: null,
          created_at: new Date(started + i * 20_000).toISOString(),
        },
        actor: null,
      })).reverse();
      log("MIS  /notifications ->", data.length, "items");
      return json(res, { data, pagination: {} });
    }
    if (url.pathname === "/home" || url.pathname === "/documents") {
      return html(
        res,
        page(
          "NGA MIS (fake)",
          `<p>Signed in. Polling <code>/notifications</code> every 5 s with XHR.</p>
<button onclick="document.documentElement.className=document.documentElement.className==='dark'?'light':'dark'">Toggle MIS theme</button>
<script>
${process.env.FAKE_SIGNIN ? "if(!sessionStorage.getItem('signinTried')){sessionStorage.setItem('signinTried','1');setTimeout(()=>{out('starting browser sign-in');location.href='/desktop/signin?via=google';},6000);}" : ""}
setInterval(()=>{const x=new XMLHttpRequest();x.open('GET','/notifications?limit=20');x.setRequestHeader('Authorization','Bearer fake');x.onload=()=>out('polled '+JSON.parse(x.responseText).data.length);x.send();},5000);
</script>`,
        ),
      );
    }
    return redirect(res, "/home");
  })
  .listen(5173, () => log("MIS        http://localhost:5173"));

// ── Task Mentor :5174 (base /taskmentor) ────────────────────────────────────
http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost:5174");
    if (req.method === "OPTIONS") return json(res, {});
    if (url.pathname === "/dashboard/instructor/overview") {
      const n = tick();
      const alerts = [
        { id: "all-clear", severity: "info", title: "All clear", message: "" },
        ...Array.from({ length: n }, (_, i) => ({
          id: `ungraded-${i + 1}`,
          severity: "warning",
          title: `${i + 3} submissions waiting for marks`,
          message: "Quiz: Algebra basics",
          action: { label: "Grade", url: "/taskmentor/grades" },
        })),
      ];
      log("TM   overview -> alerts", alerts.length, "auth:", req.headers.authorization ? "yes" : "NO");
      return json(res, { data: { alerts } });
    }
    if (url.pathname === "/taskmentor/sso/callback") return html(res, page("Task Mentor", `<script>location.replace('/taskmentor/dashboard')</script>`));
    if (url.pathname.startsWith("/taskmentor/")) {
      return html(
        res,
        page(
          "Task Mentor (fake)",
          `<p>Polls the overview <b>only while visible</b>, like the real bell (and once at start).</p>
<script>
const poll=()=>{const x=new XMLHttpRequest();x.open('GET','http://localhost:5174/dashboard/instructor/overview');x.setRequestHeader('Authorization','Bearer tm-fake');x.onload=()=>out('polled');x.send();};
poll(); setInterval(()=>{ if(document.visibilityState==='visible') poll(); },10000);
</script>`,
        ),
      );
    }
    return redirect(res, "/taskmentor/dashboard");
  })
  .listen(5174, () => log("Task Mentor http://localhost:5174/taskmentor"));

// ── Tendo :3000 ──────────────────────────────────────────────────────────────
http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost:3000");
    if (url.pathname === "/api/notifications") {
      const n = tick();
      const data = Array.from({ length: n + 1 }, (_, i) => ({
        id: 500 + i,
        type: "register_missing",
        title: i === 0 ? "Old Tendo item" : `Register not taken: S${i} Maths`,
        message: i === 0 ? "Must NOT notify" : "Period 2 started 10 minutes ago.",
        link: "/attendance/mark",
        severity: "warning",
        read: 0,
        created_at: new Date(started + i * 20_000).toISOString(),
      })).reverse();
      log("Tendo /api/notifications ->", data.length, "items");
      return json(res, { data });
    }
    if (url.pathname === "/sso/callback") return html(res, page("Tendo", `<script>location.replace('/dashboard')</script>`));
    if (url.pathname === "/") return html(res, page("Tendo sign-in (fake)", `<p>Signed-out page.</p>`));
    return html(
      res,
      page(
        "Tendo (fake)",
        `<p>Polls <code>/api/notifications</code> every 5 s with fetch.</p>
<script>setInterval(()=>fetch('/api/notifications').then(r=>r.json()).then(j=>out('polled '+j.data.length)),5000);</script>
<script>setTimeout(()=>{const r=document.documentElement;const next=r.getAttribute('data-theme')==='dark'?'light':'dark';out('user switches Tendo to '+next);r.setAttribute('data-theme',next);},25000);</script>`,
      ),
    );
  })
  .listen(3000, () => log("Tendo      http://localhost:3000"));

// PROBE: Tupo usually sits hidden behind another app. Can it still ring?
// An unmuted <audio> tone and a Web Audio oscillator (Tupo's sounds.ts) play
// while hidden; their clocks must advance. Reported to MIS's /probe-bg.
const BG_AUDIO = !process.env.PROBE ? "" : `<script>
setTimeout(async()=>{
  const R={'background: Tupo visibility when tested':document.visibilityState};
  try{
    const rate=8000,n=16000,buf=new ArrayBuffer(44+n*2),v=new DataView(buf);
    const w=(o,str)=>[...str].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
    w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
    v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
    for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.sin(2*Math.PI*440*i/rate)*800,true);
    const a=new Audio(URL.createObjectURL(new Blob([buf],{type:'audio/wav'})));a.volume=0.03;
    await a.play();await new Promise(r=>setTimeout(r,1500));
    R['background: ringtone <audio> plays while hidden']=(a.currentTime>0.5?'yes':'STUCK')+' (advanced '+a.currentTime.toFixed(2)+' s in 1.5 s)';a.pause();
  }catch(e){R['background: ringtone <audio> plays while hidden']='ERROR '+e.name+': '+e.message;}
  try{
    const c=new AudioContext();await c.resume();const o=c.createOscillator(),g=c.createGain();g.gain.value=0.02;o.connect(g);g.connect(c.destination);o.start();
    const t0=c.currentTime;await new Promise(r=>setTimeout(r,1500));
    R['background: Web Audio sound plays while hidden']=(c.currentTime-t0>0.5?'yes':'STUCK')+' ('+c.state+', clock advanced '+(c.currentTime-t0).toFixed(2)+' s in 1.5 s)';o.stop();c.close();
  }catch(e){R['background: Web Audio sound plays while hidden']='ERROR '+e.name+': '+e.message;}
  try{
    // A meeting's far-side audio: WebRTC in, played by an <audio>, while hidden.
    const c=new AudioContext();await c.resume();const o=c.createOscillator(),d=c.createMediaStreamDestination();o.connect(d);o.start();
    const a=new RTCPeerConnection(),b=new RTCPeerConnection();
    a.onicecandidate=e=>e.candidate&&b.addIceCandidate(e.candidate);b.onicecandidate=e=>e.candidate&&a.addIceCandidate(e.candidate);
    const got=new Promise(r=>b.ontrack=e=>r(e.streams[0]||new MediaStream([e.track])));
    d.stream.getTracks().forEach(t=>a.addTrack(t,d.stream));
    await a.setLocalDescription(await a.createOffer());await b.setRemoteDescription(a.localDescription);
    await b.setLocalDescription(await b.createAnswer());await a.setRemoteDescription(b.localDescription);
    const el=new Audio();el.volume=0.02;el.srcObject=await got;await el.play();
    const pk=async()=>{let n=0;(await b.getStats()).forEach(s=>{if(s.type==='inbound-rtp'&&s.kind==='audio')n=s.totalSamplesReceived||s.packetsReceived||0});return n};
    const p0=await pk(),t0=el.currentTime;await new Promise(r=>setTimeout(r,3000));const p1=await pk();
    R['background: meeting audio (WebRTC) keeps playing while hidden']=(p1>p0&&el.currentTime-t0>1?'yes':'STUCK')+' ('+b.connectionState+', received '+(p1-p0)+', element advanced '+(el.currentTime-t0).toFixed(2)+' s in 3 s)';
    el.pause();a.close();b.close();o.stop();c.close();
  }catch(e){R['background: meeting audio (WebRTC) keeps playing while hidden']='ERROR '+e.name+': '+e.message;}
  fetch('http://localhost:5173/probe-bg',{method:'POST',mode:'no-cors',body:JSON.stringify(R)}).catch(()=>{});
},9000);
</script>`;
let probeBg = {};

// ── Tupo :5194 ───────────────────────────────────────────────────────────────
http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost:5194");
    if (url.pathname === "/__theme") {
      const names = { 5173: "MIS", 5174: "TM", 3000: "Tendo", 5194: "Tupo" };
      log("THEME", names[url.searchParams.get("port")] || url.searchParams.get("port"), url.searchParams.get("t"));
      res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
      return res.end();
    }
    if (url.pathname === "/report") {
      log("Tupo page:", url.search);
      return json(res, {});
    }
    // Like the real Tupo: the callback exchanges the code, then a client-side
    // navigation (no page load) to the app.
    if (url.pathname === "/sso/callback") return html(res, page("Tupo", `<p>Verifying your session…</p>${BG_AUDIO}<script>setTimeout(()=>{history.replaceState(null,'','/app/chat');document.querySelector('h1').textContent='Tupo chat (SPA)';},1200)${process.env.FAKE_SIGNOUT_TEST ? ";if(!sessionStorage.getItem('so')){setTimeout(()=>{sessionStorage.setItem('so','1');location.href='/';},25000);}" : ""}</script>`));
    if (url.pathname === "/") return html(res, page("Tupo sign-in (fake)", `<p>Signed-out page.</p>`));
    return html(
      res,
      page(
        "Tupo (fake)",
        `<p>Like Tupo: a system notification for each new message while the tab is hidden; badge = unread.</p>${BG_AUDIO}
<script>
${process.env.FAKE_SIGNOUT_TEST ? "if(!sessionStorage.getItem('so')){setTimeout(()=>{sessionStorage.setItem('so','1');out('Tupo: Sign out pressed');location.href='/';},25000);}" : ""}
let unread=0, n=0;
out('Notification.permission = '+Notification.permission);
setInterval(()=>{
  n++;
  fetch('/report?hidden='+document.hidden+'&state='+document.visibilityState+'&perm='+Notification.permission+'&shim='+(Notification.name)).catch(()=>{});
  if (document.hidden && Notification.permission==='granted') {
    unread++;
    const s=new Notification('Alice Uwase', {body:'Message '+n+': are we meeting at 10?', tag:'chat-'+n});
    s.onclick=()=>{ out('CLICKED notification '+n); unread=0; navigator.setAppBadge(0); };
    navigator.setAppBadge(unread);
    out('sent notification '+n);
  } else out('visible: no system notification ('+n+')');
},8000);
</script>`,
      ),
    );
  })
  .listen(5194, () => log("Tupo       http://localhost:5194"));
