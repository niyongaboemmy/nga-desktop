// Fake Tauri internals for driving the shell UI in a plain browser (Playwright, e2e/).
// Injected with context.addInitScript before the page loads; see e2e/README.md.
(() => {
  const params = new URLSearchParams(location.search);
  const signedOut = localStorage.getItem("mock.signedOut") === "1";
  const label = params.has("tool") ? `${params.has("present") ? "present" : "tool"}-${params.get("tool")}` : "shell";
  const listeners = {};
  const cbs = {};
  let cbId = 1;
  const state = JSON.parse(localStorage.getItem("mock.state") || '{"timers":[],"next":0,"stores":{}}');
  const save = () => localStorage.setItem("mock.state", JSON.stringify(state));
  if (localStorage.getItem("nga.theme") === "dark") state.stores["settings.json"] = { ...(state.stores["settings.json"] || {}), theme: "dark", onboarded: true };
  const persona = localStorage.getItem("mock.persona") || "teacher";
  const identity = signedOut ? null : { userId: 42, persona, firstName: "Aline", ageBand: persona === "student" ? "13to17" : "adult" };
  const emit = (event, payload) => (listeners[event] || []).forEach((h) => cbs[h] && cbs[h]({ event, payload, id: 1 }));
  window.__mockEmit = emit;
  const apps = [
    ["mis", "NGA MIS", "#2f56d9"], ["taskmentor", "Task Mentor", "#7c3aed"], ["tendo", "Tendo", "#0d9488"], ["tupo", "Tupo", "#ea580c"],
  ].map(([key, name, color]) => ({ key, name, description: `${name} app`, origin: `https://${key}.amashuri.com`, base: "", startPath: "/", color, sso: null, destinations: [] }));
  const rids = {};
  let ridN = 1;
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: label === "shell" ? "main" : label }, currentWebview: { windowLabel: label === "shell" ? "main" : label, label } },
    transformCallback(cb) { const id = cbId++; cbs[id] = cb; return id; },
    unregisterCallback(id) { delete cbs[id]; },
    convertFileSrc: (s) => s,
    async invoke(cmd, args = {}) {
      window.__calls = (window.__calls || []).concat([cmd]);
      window.__invokes = (window.__invokes || []).concat([{ cmd, args }]);
      const now = Date.now();
      switch (cmd) {
        case "shell_info": return { version: "0.3.0", env: "development", os: "macos", webview: "", apps, updater: localStorage.getItem("mock.updater") === "1" };
        case "notices_summary": return { unread: {}, badges: {}, total: 0 };
        case "notices_list": return JSON.parse(localStorage.getItem("mock.notices") || "[]");
        case "notices_snooze": {
          const list = JSON.parse(localStorage.getItem("mock.notices") || "[]").map((n) => (n.id === args.id ? { ...n, read: true } : n));
          localStorage.setItem("mock.notices", JSON.stringify(list)); setTimeout(() => emit("nga://notices", {}), 0); return null;
        }
        case "update_auto_get": return localStorage.getItem("mock.autoUpdate") !== "0";
        case "update_auto_set": localStorage.setItem("mock.autoUpdate", args.on ? "1" : "0"); return null;
        case "autostart_get": return localStorage.getItem("mock.autostart") === "1";
        case "autostart_set": localStorage.setItem("mock.autostart", args.on ? "1" : "0"); return null;
        case "focus_session": return null;
        case "os_permission": return "granted";
        case "tools_identity": return identity;
        // A fixed 32-byte key when a test asks for the encrypted store (tools/vault.rs).
        case "tools_vault_key": return localStorage.getItem("mock.vault") === "1" ? btoa(String.fromCharCode(...new Uint8Array(32).fill(5))) : null;
        case "timers_list": return state.timers;
        case "timer_create": {
          const t = args.timer;
          state.next++;
          const base = { id: state.next, label: t.label || "", elapsedMs: 0, runningSince: now, finishedAt: null, laps: [], focus: null, createdAt: now };
          let timer;
          if (t.kind === "countdown") timer = { ...base, kind: "countdown", durationMs: t.durationMs };
          else if (t.kind === "stopwatch") timer = { ...base, kind: "stopwatch", durationMs: 0 };
          else timer = { ...base, kind: "focus", durationMs: t.workMs, focus: { workMs: t.workMs, breakMs: t.breakMs, rounds: t.rounds, round: 1, phase: "work", focusedMs: 0 } };
          state.timers.push(timer); save(); emit("nga://timers", state.timers); return timer;
        }
        case "timer_action": {
          const t = state.timers.find((x) => x.id === args.id);
          if (args.action === "delete") state.timers = state.timers.filter((x) => x.id !== args.id);
          else if (args.action === "pause" && t.runningSince) { t.elapsedMs += now - t.runningSince; t.runningSince = null; }
          else if (args.action === "resume") t.runningSince = now;
          else if (args.action === "lap") t.laps.push(t.elapsedMs + (t.runningSince ? now - t.runningSince : 0));
          save(); emit("nga://timers", state.timers); return null;
        }
        case "tools_save_file": window.__saved = (window.__saved || []).concat([{ name: args.name, data: args.data }]); return `/Users/test/Downloads/${args.name}`;
        case "overlay_show": setTimeout(() => emit("nga://overlay", args.view), 0); return null;
        case "navigate_app": window.__navigated = `${args.key}${args.path}`; return null;
        case "overlay_hide": setTimeout(() => emit("nga://overlay", "closed"), 0); return null;
        case "tools_api_cancel": return null;
        case "tools_api": {
          const ev = (kind, data) => emit("nga://tools-api", { id: args.id, kind, data });
          if (args.path === "/desktop/tools/classes") {
            const names = ["Aline U.", "Brian H.", "Claudine M.", "David N.", "Esther K.", "Fabrice T.", "Grace I.", "Hervé B.", "Ines R.", "Jean-Paul S.", "Keza A.", "Lionel G."];
            const classes = [{ classGroupId: 7, name: "S4 MPC", grade: "S4", students: names.map((n, i) => ({ id: 100 + i, name: n })) }, { classGroupId: 8, name: "S2 A", grade: "S2", students: names.slice(0, 5).map((n, i) => ({ id: 200 + i, name: n })) }];
            setTimeout(() => ev("response", JSON.stringify({ status: 200, body: JSON.stringify({ success: true, data: { classes } }) })), 50);
            return null;
          }
          if (args.path === "/desktop/tools/agenda") {
            const m = 60_000, iso = (d) => new Date(Date.now() + d).toISOString();
            const items = [
              { key: "l1", kind: "lesson", title: "Physics", detail: "S4 MPC", location: "Lab 2", link: "/dashboard", color: "#3b82f6", role: "attending", critical: false, start: iso(-20 * m), end: iso(40 * m) },
              { key: "q1", kind: "quiz_open", title: "Maths CAT opens", detail: null, location: null, link: "https://taskmentor.amashuri.com/quizzes/12", color: null, role: "other", critical: false, start: iso(55 * m), end: null },
              { key: "o1", kind: "office_hours", title: "Office hours: Chemistry", detail: "Ms. Uwase", location: "Academy Hall", link: "/my-office-hours", color: null, role: "attending", critical: false, start: iso(90 * m), end: iso(120 * m) },
              { key: "p1", kind: "lesson", title: "English", detail: "S4 MPC", location: "B3", link: null, color: "#ef4444", role: "attending", critical: false, start: iso(-200 * m), end: iso(-120 * m) },
              { key: "t1", kind: "lesson", title: "Biology (tomorrow)", detail: null, location: null, link: null, color: "#22c55e", role: "attending", critical: false, start: iso(24 * 60 * m), end: iso(24 * 60 * m + 60 * m) },
            ];
            setTimeout(() => ev("response", JSON.stringify({ status: 200, body: JSON.stringify({ success: true, data: { now: iso(0), today: "x", days: 7, items } }) })), 60);
            window.__lastQuery = args.query;
            return null;
          }
          if (args.path.startsWith("/desktop/tools/class-game-time")) {
            const store = JSON.parse(localStorage.getItem("mock.cgt") || "[]");
            if (args.method === "POST" && args.path === "/desktop/tools/class-game-time") {
              const b = JSON.parse(args.body);
              const row = { id: store.length + 1, classGroupId: b.classGroupId, className: "S4 MPC", games: b.games, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + b.minutes * 60_000).toISOString(), by: "Aline" };
              localStorage.setItem("mock.cgt", JSON.stringify([...store.map((r) => ({ ...r, endsAt: r.classGroupId === b.classGroupId ? new Date().toISOString() : r.endsAt })), row]));
              window.__cgtPosts = (window.__cgtPosts || []).concat([b]);
              setTimeout(() => ev("response", JSON.stringify({ status: 200, body: JSON.stringify({ success: true, data: row }) })), 30);
            } else if (args.method === "POST") {
              const id = Number(args.path.split("/")[4]);
              localStorage.setItem("mock.cgt", JSON.stringify(store.map((r) => (r.id === id ? { ...r, endsAt: new Date().toISOString() } : r))));
              setTimeout(() => ev("response", JSON.stringify({ status: 200, body: JSON.stringify({ success: true, data: { ended: true } }) })), 30);
            } else {
              const active = store.filter((r) => Date.parse(r.endsAt) > Date.now());
              setTimeout(() => ev("response", JSON.stringify({ status: 200, body: JSON.stringify({ success: true, data: { active } }) })), 30);
            }
            return null;
          }
          // Translation workspace (localStorage "mock.tr" = { entries: {lang: {key: entry}}, releases: {lang: [..]} }; "mock.trPerm" = "1").
          if (args.path.startsWith("/desktop/tools/i18n/")) {
            const fnv = (t) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); };
            const db = JSON.parse(localStorage.getItem("mock.tr") || '{"entries":{"fr":{},"rw":{}},"releases":{"fr":[],"rw":[]},"next":1}');
            const persist = () => localStorage.setItem("mock.tr", JSON.stringify(db));
            const reply = (status, data) => setTimeout(() => ev("response", JSON.stringify({ status, body: JSON.stringify(status === 200 ? { success: true, data } : { success: false, message: data, code: status === 403 ? "NO_PERMISSION" : "BAD" }) })), 30);
            const perm = localStorage.getItem("mock.trPerm") === "1";
            const parts = args.path.split("/").slice(4); // ["workspace","fr"] | ["fr"] | ["edit"] …
            const b = args.body ? JSON.parse(args.body) : {};
            if (args.method === "GET" && parts[0] === "workspace") {
              if (!perm) return reply(403, "Ask an admin for the translations permission."), null;
              return reply(200, { entries: db.entries[parts[1]] || {}, releases: [...(db.releases[parts[1]] || [])].reverse() }), null;
            }
            if (args.method === "GET") {
              const rel = (db.releases[parts[0]] || []).at(-1);
              return reply(200, rel ? { release: rel.id, strings: rel.strings } : { release: 0, strings: {} }), null;
            }
            if (!perm) return reply(403, "Ask an admin for the translations permission."), null;
            window.__trCalls = (window.__trCalls || []).concat([{ action: parts[0], body: b }]);
            if (parts[0] === "edit") {
              const e = { text: b.text, status: b.status, sourceHash: fnv(b.en), updatedBy: "Aline", updatedAt: new Date().toISOString(), approvedBy: b.status === "approved" ? "Aline" : null };
              db.entries[b.lang][b.key] = e; persist(); return reply(200, { key: b.key, ...e }), null;
            }
            if (parts[0] === "revert") { delete db.entries[b.lang][b.key]; persist(); return reply(200, { reverted: true }), null; }
            if (parts[0] === "publish" || parts[0] === "rollback") {
              const strings = parts[0] === "publish"
                ? Object.fromEntries(Object.entries(db.entries[b.lang]).filter(([, e]) => e.status === "approved").map(([k, e]) => [k, { t: e.text, h: e.sourceHash }]))
                : db.releases[b.lang].find((r) => r.id === b.release).strings;
              const rel = { id: db.next++, count: Object.keys(strings).length, note: parts[0] === "rollback" ? `Back to release #${b.release}` : null, publishedAt: new Date().toISOString(), publishedBy: "Aline", strings };
              db.releases[b.lang].push(rel); persist(); return reply(200, { id: rel.id, count: rel.count }), null;
            }
            if (parts[0] === "suggest") return reply(200, { text: `[IA] ${b.en}` }), null;
            return reply(400, "unknown"), null;
          }
          if (args.path === "/desktop/tools/games/usage") {
            window.__usagePosts = (window.__usagePosts || []).concat([JSON.parse(args.body)]);
            setTimeout(() => ev("response", JSON.stringify({ status: 200, body: JSON.stringify({ success: true, data: { saved: 1 } }) })), 30);
            return null;
          }
          if (args.path === "/desktop/tools/policy") {
            // localStorage "mock.policy": open | lesson | exam | budget | quiet | off | igisoro | classtime | blocked
            const mode = localStorage.getItem("mock.policy") || "open";
            const m = 60_000, iso = (d) => new Date(Date.now() + d).toISOString();
            const windows = mode === "lesson" || mode === "classtime" ? [{ from: iso(-10 * m), to: iso(30 * m), kind: "lesson", label: "Physics S4", role: persona === "student" ? "attending" : "teaching" }]
              : mode === "exam" ? [{ from: iso(-10 * m), to: iso(30 * m), kind: "exam", label: "Maths CAT" }] : [];
            const all = ["number-place", "picture-logic", "lights-out", "mines", "sliding-15", "merge-2048", "pairs", "echo", "five-letter", "word-search", "math-sprint", "code-breaker", "four-in-a-row", "snake", "breathe", "stretch", "typing"];
            const games = { enabled: mode !== "off", allowed: mode === "off" ? [] : mode === "igisoro" ? ["igisoro", ...all] : all, dailyBudgetMin: persona === "student" ? 30 : null, usedTodayMin: mode === "budget" ? 30 : 12,
              sessionCapMin: Number(localStorage.getItem("mock.cap") || 10), cooldownMin: 5, quietHours: mode === "quiet" ? ["00:00", "23:59"] : null, learning: ["pairs", "five-letter", "word-search", "math-sprint", "typing"],
              igisoroVariant: mode === "igisoro" ? "standard" : null,
              classGameTime: mode === "classtime" ? { until: iso(15 * m), games: ["mines", "typing"], by: "Mr Habimana", className: "S4 MPC" } : null,
              override: mode === "blocked" ? { kind: "block", until: iso(3 * 24 * 60 * m), reason: "parent request", extraMin: null } : null };
            window.__policyCalls = (window.__policyCalls || 0) + 1;
            setTimeout(() => ev("response", JSON.stringify({ status: 200, body: JSON.stringify({ success: true, data: { generatedAt: iso(0), validUntil: iso(600 * m), windows, exam: { active: mode === "exam", until: null, label: null }, games } }) })), 40);
            return null;
          }
          if (args.path === "/desktop/tools/ai/status") {
            const student = persona === "student";
            const consent = localStorage.getItem("mock.consent") === "needed";
            const data = student ? { available: !consent, reason: consent ? "CONSENT_NEEDED" : null, persona, mode: "tutor", limit: 15, used: 1, remaining: 14 } : { available: true, reason: null, persona, mode: "assistant", limit: 40, used: 3, remaining: 37 };
            setTimeout(() => ev("response", JSON.stringify({ status: 200, body: JSON.stringify({ success: true, data }) })), 80);
          } else if (args.path === "/desktop/tools/ai/report") {
            window.__reports = (window.__reports || []).concat([JSON.parse(args.body)]);
            setTimeout(() => ev("response", JSON.stringify({ status: 200, body: JSON.stringify({ success: true, data: { reported: true } }) })), 30);
          } else if (args.path === "/desktop/tools/ai/chat" && persona === "student") {
            const b = JSON.parse(args.body);
            window.__tutorBodies = (window.__tutorBodies || []).concat([b]);
            if (localStorage.getItem("mock.policy") === "lesson") {
              setTimeout(() => ev("response", JSON.stringify({ status: 423, body: JSON.stringify({ success: false, code: "LOCKED_LESSON", label: "Physics S4", until: new Date(Date.now() + 30 * 60_000).toISOString(), message: "The AI Tutor pauses during your lessons." }) })), 40);
              return null;
            }
            setTimeout(() => ev("lines", JSON.stringify({ status: "thinking" })), 50);
            setTimeout(() => ev("lines", JSON.stringify({ t: "Good start! What do you get if you subtract 5 from both sides of \\(3x + 5 = 20\\)?" })), 400);
            const fromCache = /^what is /i.test(b.messages.at(-1).content);
            setTimeout(() => ev("lines", JSON.stringify({ done: true, mode: "tutor", provider: fromCache ? "cache" : "glm", cached: fromCache || undefined, messageId: 77, remaining: fromCache ? 14 : 13 })), 450);
            setTimeout(() => ev("end", null), 480);
          } else if (args.path === "/desktop/tools/ai/chat") {
            const pieces = ["Here is a **10-minute starter** on photosynthesis:\n\n", "1. Show a leaf and ask *what does a plant eat?*\n", "2. Write the equation: $6CO_2 + 6H_2O \\rightarrow C_6H_{12}O_6 + 6O_2$\n", "3. Pairs list 3 things a plant needs.\n\n| Step | Time |\n|---|---|\n| Hook | 3 min |\n| Pairs | 7 min |"];
            pieces.forEach((p, i) => setTimeout(() => ev("lines", JSON.stringify({ t: p })), 150 + i * 220));
            setTimeout(() => ev("lines", JSON.stringify({ done: true, provider: "groq", remaining: 36 })), 150 + pieces.length * 220);
            setTimeout(() => ev("end", null), 200 + pieces.length * 220);
          }
          return null;
        }
        case "tools_displays": return [{ index: 0, name: "Built-in", width: 2880, height: 1800, primary: true, current: true }];
        case "plugin:event|listen": (listeners[args.event] = listeners[args.event] || []).push(args.handler); return args.handler;
        case "plugin:event|unlisten": return null;
        case "plugin:store|load": { const r = ridN++; rids[r] = args.path; state.stores[args.path] = state.stores[args.path] || {}; return r; }
        case "plugin:store|get_store": return null;
        case "plugin:store|get": { const v = state.stores[rids[args.rid]]?.[args.key]; return [v ?? null, v !== undefined]; }
        case "plugin:store|set": state.stores[rids[args.rid]][args.key] = args.value; save(); return null;
        default: return null;
      }
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  // Clipboard in headless browsers.
  try { Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} } }); } catch {}
})();
