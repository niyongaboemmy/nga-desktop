import { describe, expect, it, vi } from "vitest";
// @ts-expect-error jsdom ships without type declarations in this project
import { JSDOM } from "jsdom";
import bridgeSource from "../src-tauri/src/bridge.js?raw";

// bridge.js as webviews.rs injects it (placeholders filled), in a fresh page per test.
type Call = { cmd: string; args: Record<string, unknown> };

type Answer = { ok?: boolean; status: number; headers?: unknown; text?: () => Promise<string>; clone?: () => unknown; json?: () => Promise<unknown> };

function boot(
  opts: { app?: string; url?: string; cookie?: string; storage?: Record<string, string>; respond?: (url: string) => Answer } = {},
) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: opts.url ?? "https://mis.amashuri.com/home",
    runScripts: "outside-only",
  });
  const w = dom.window;
  const calls: Call[] = [];
  const intervals: Array<() => void> = [];
  w.__TAURI_INTERNALS__ = {
    invoke: (cmd: string, args: Record<string, unknown>) => {
      calls.push({ cmd, args });
      return Promise.resolve(null);
    },
  };
  w.setInterval = (fn: () => void) => {
    intervals.push(fn);
    return intervals.length;
  };
  const fetches: Array<{ url: string; headers: Record<string, string> }> = [];
  w.fetch = vi.fn((url: string, init?: { headers?: Record<string, string> }) => {
    fetches.push({ url: String(url), headers: { ...(init?.headers ?? {}) } });
    const answer = opts.respond?.(String(url));
    return Promise.resolve(answer ?? { ok: false, status: 404, headers: { get: () => "" }, text: () => Promise.resolve("") });
  });
  for (const [k, v] of Object.entries(opts.storage ?? {})) w.localStorage.setItem(k, v);
  if (opts.cookie) w.document.cookie = opts.cookie;
  const src = bridgeSource
    .replace(/__NGA_PLATFORM__/g, '"other"')
    .replace(/__NGA_APP__/g, JSON.stringify(opts.app ?? "mis"))
    .replace(/__NGA_API__/g, '"https://api.amashuri.com"')
    .replace(/__NGA_VERSION__/g, '"0.0.0"');
  w.eval(src);
  const tick = async () => {
    intervals.forEach((f) => f());
    await new Promise((r) => setTimeout(r, 0));
  };
  return { w, calls, fetches, tick, identities: () => calls.filter((c) => c.cmd === "web_identity").map((c) => c.args) };
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
// A session token valid for an hour (MIS signs `userId`, `tid` and `exp`).
const EXP = Math.floor(Date.now() / 1000) + 3600;
const token = (tid?: number, userId = 7, exp: number = EXP, extra: object = {}) =>
  `h.${b64({ userId, ...(tid ? { tid } : {}), exp, ...extra })}.s`;
const profile = (tid: number, userId: number, email = "teacher@school.rw") =>
  JSON.stringify({
    tenant: { tid },
    user: { user_id: userId, email },
    profile: { user_type: "TEACHER", first_name: "Ada", date_of_birth: null },
  });
const signedIn = (tid: number, userId: number, email?: string) => ({
  token: token(tid, userId),
  "nga.identity": `${tid}:${userId}`,
  [`nga.user.offlineCache.t${tid}.u${userId}`]: profile(tid, userId, email),
});

describe("bridge.js: who is signed in (MIS page)", () => {
  it("reads MIS's per-school profile cache and reports the e-mail", async () => {
    const b = boot({ storage: signedIn(2, 31), cookie: "nga_school=2.abcdefgh12" });
    await b.tick();
    expect(b.identities()).toEqual([
      { userId: 31, tid: 2, userType: "TEACHER", firstName: "Ada", dateOfBirth: null, email: "teacher@school.rw", switched: false },
    ]);
  });

  it("still reads the single cache key of an older MIS (tenant from the token)", () => {
    const b = boot({ storage: { token: token(1), "nga.user.offlineCache": profile(1, 7) } });
    expect(b.identities()[0]).toMatchObject({ userId: 7, tid: 1 });
  });

  it("reports nothing while the school cookie and the session disagree (mid-switch)", async () => {
    // The cookie already says school 3; the page still holds school 2's session.
    const b = boot({ storage: signedIn(2, 31), cookie: "nga_school=3.abcdefgh12" });
    await b.tick();
    expect(b.identities()).toEqual([]);
    // MIS finishes the switch: token, identity and profile of school 3.
    for (const [k, v] of Object.entries(signedIn(3, 44))) b.w.localStorage.setItem(k, v);
    await b.tick();
    expect(b.identities()).toEqual([expect.objectContaining({ userId: 44, tid: 3 })]);
  });

  it("ignores a cached profile that belongs to someone else", () => {
    const b = boot({
      storage: { token: token(2), "nga.identity": "2:31", "nga.user.offlineCache": profile(2, 99) },
    });
    expect(b.identities()).toEqual([]);
  });

  it("ignores a malformed school cookie", () => {
    const b = boot({ storage: signedIn(2, 31), cookie: "nga_school=2.short" });
    expect(b.identities()[0]).toMatchObject({ tid: 2 });
  });
});

describe("bridge.js: DK-ISO-1 nobody is reported while MIS is signed out", () => {
  it("reports nothing without a token, even with the previous person's profile left behind", async () => {
    const left = signedIn(2, 31);
    delete (left as Record<string, string>).token;
    const b = boot({ storage: left, cookie: "nga_school=2.abcdefgh12" });
    await b.tick();
    expect(b.identities()).toEqual([]);
  });

  it("reports nothing with an expired token", async () => {
    const b = boot({
      storage: { ...signedIn(2, 31), token: token(2, 31, Math.floor(Date.now() / 1000) - 60) },
      cookie: "nga_school=2.abcdefgh12",
    });
    await b.tick();
    expect(b.identities()).toEqual([]);
  });

  it("reports nothing with a token that has no exp or no userId", async () => {
    const noExp = `h.${b64({ userId: 31, tid: 2 })}.s`;
    const noUser = `h.${b64({ tid: 2, exp: EXP })}.s`;
    for (const t of [noExp, noUser, "garbage"]) {
      const b = boot({ storage: { ...signedIn(2, 31), token: t }, cookie: "nga_school=2.abcdefgh12" });
      await b.tick();
      expect(b.identities()).toEqual([]);
    }
  });

  it("reports nothing when the token names another person than nga.identity", async () => {
    const b = boot({ storage: { ...signedIn(2, 31), token: token(2, 99) }, cookie: "nga_school=2.abcdefgh12" });
    await b.tick();
    expect(b.identities()).toEqual([]);
  });

  it("never falls back to the unscoped legacy cache when nga.identity is set", async () => {
    // A modern MIS (nga.identity) without its scoped copy, and the legacy key of someone.
    const b = boot({
      storage: { token: token(2, 31), "nga.identity": "2:31", "nga.user.offlineCache": profile(2, 31) },
      cookie: "nga_school=2.abcdefgh12",
    });
    await b.tick();
    expect(b.identities()).toEqual([]);
  });

  it("reads the legacy cache (no nga.identity) only for the token's own person", async () => {
    const other = boot({ storage: { token: token(1, 8), "nga.user.offlineCache": profile(1, 7) } });
    await other.tick();
    expect(other.identities()).toEqual([]);
    const own = boot({ storage: { token: token(1, 7), "nga.user.offlineCache": profile(1, 7) } });
    expect(own.identities()[0]).toMatchObject({ userId: 7, tid: 1 });
  });

  it("stops reporting after the token goes, and reports again on the next sign-in", async () => {
    const b = boot({ storage: signedIn(2, 31), cookie: "nga_school=2.abcdefgh12" });
    await b.tick();
    expect(b.identities()).toHaveLength(1);
    b.w.localStorage.removeItem("token"); // signed out in a spoke / by MIS
    await b.tick();
    await b.tick();
    expect(b.identities()).toHaveLength(1);
    b.w.localStorage.setItem("token", token(2, 31));
    await b.tick();
    expect(b.identities()).toHaveLength(2);
  });
});

describe("bridge.js: DK-ISO-2 switch signal", () => {
  it("flags the report after nga_school changed while the page stayed signed in", async () => {
    const b = boot({ storage: signedIn(2, 31), cookie: "nga_school=2.abcdefgh12" });
    await b.tick();
    expect(b.identities()[0]).toMatchObject({ switched: false });
    b.w.document.cookie = "nga_school=3.abcdefgh12";
    await b.tick(); // mid-switch: nothing reported
    for (const [k, v] of Object.entries(signedIn(3, 44))) b.w.localStorage.setItem(k, v);
    await b.tick();
    expect(b.identities()[1]).toMatchObject({ userId: 44, tid: 3, switched: true });
  });

  it("does not flag a sign-in that follows a sign-out", async () => {
    const b = boot({ storage: signedIn(2, 31), cookie: "nga_school=2.abcdefgh12" });
    await b.tick();
    b.w.localStorage.clear();
    b.w.document.cookie = "nga_school=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    await b.tick();
    b.w.document.cookie = "nga_school=3.abcdefgh12";
    for (const [k, v] of Object.entries(signedIn(3, 44))) b.w.localStorage.setItem(k, v);
    await b.tick();
    expect(b.identities()[1]).toMatchObject({ userId: 44, tid: 3, switched: false });
  });
});

describe("bridge.js: DK-ISO-6 e-mail from the token", () => {
  it("prefers the token's e-mail claim over the page's cached profile", async () => {
    const b = boot({
      storage: { ...signedIn(2, 31, "cached@school.rw"), token: token(2, 31, EXP, { email: "claim@school.rw" }) },
      cookie: "nga_school=2.abcdefgh12",
    });
    await b.tick();
    expect(b.identities()[0]).toMatchObject({ email: "claim@school.rw" });
  });

  it("falls back to the cached profile without a usable claim", async () => {
    const b = boot({
      storage: { ...signedIn(2, 31, "cached@school.rw"), token: token(2, 31, EXP, { email: "not-an-email" }) },
      cookie: "nga_school=2.abcdefgh12",
    });
    await b.tick();
    expect(b.identities()[0]).toMatchObject({ email: "cached@school.rw" });
  });
});

describe("bridge.js: DK-ISO-4 notices carry their page's school", () => {
  it("sends the nga_school tid with web_notify", () => {
    const b = boot({ app: "tupo", url: "https://tupo.amashuri.com/chat", cookie: "nga_school=4.abcdefgh12" });
    new b.w.Notification("Hello", { body: "x" });
    const call = b.calls.find((c) => c.cmd === "web_notify");
    expect(call?.args.school).toBe(4);
  });
});

describe("bridge.js: tools calls name the settled school only", () => {
  it("sends X-NGA-Tenant equal to the token's school once settled", async () => {
    const b = boot({ storage: signedIn(2, 31), cookie: "nga_school=2.abcdefgh12" });
    await b.tick();
    b.w.__ngaToolsApi("c1", "GET", "/desktop/tools/ping", null, null);
    await new Promise((r) => setTimeout(r, 10));
    const call = b.fetches.find((f) => f.url.includes("/desktop/tools/ping"));
    expect(call?.headers["X-NGA-Tenant"]).toBe("2");
  });

  it("waits during a switch instead of sending the old school with the new token", async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const b = boot({ storage: signedIn(2, 31), cookie: "nga_school=2.abcdefgh12" });
    await b.tick();
    // Switch in progress: new token, old profile.
    b.w.localStorage.setItem("token", token(3));
    b.w.__ngaToolsApi("c2", "GET", "/desktop/tools/ping", null, null);
    await wait(800);
    expect(b.fetches.some((f) => f.url.includes("/desktop/tools/ping"))).toBe(false);
    // Settled: school 3 everywhere, reported to Rust.
    b.w.document.cookie = "nga_school=3.abcdefgh12";
    for (const [k, v] of Object.entries(signedIn(3, 44))) b.w.localStorage.setItem(k, v);
    await b.tick();
    await wait(500);
    const call = b.fetches.find((f) => f.url.includes("/desktop/tools/ping"));
    expect(call?.headers["X-NGA-Tenant"]).toBe("3");
    expect(call?.headers.Authorization).toBe(`Bearer ${token(3, 44)}`);
  });
});

describe("bridge.js: notification watchers per school", () => {
  const notices = (ids: number[]): Answer => {
    const body = { data: ids.map((id) => ({ id, title: `n${id}`, message: "", read: false, created_at: new Date().toISOString() })) };
    return { ok: true, status: 200, clone: () => ({ json: () => Promise.resolve(body) }), json: () => Promise.resolve(body) };
  };
  const flush = () => new Promise((r) => setTimeout(r, 5));

  it("keeps the seen ids per school (tenant 1 keeps the old key)", async () => {
    const b = boot({
      app: "tendo",
      url: "https://tendo.amashuri.com/attendance",
      cookie: "nga_school=4.abcdefgh12",
      respond: (u) => (u.includes("/api/notifications") ? notices([1, 2]) : undefined)!,
    });
    await b.w.fetch("/api/notifications");
    await flush();
    expect(JSON.parse(b.w.localStorage.getItem("nga.desktop.seen.v1.t4") ?? "[]")).toEqual(["n1", "n2"]);
    expect(b.w.localStorage.getItem("nga.desktop.seen.v1")).toBeNull();

    // Switched to school 1: its own (legacy) list, first run again (no flood of banners).
    b.w.document.cookie = "nga_school=1.abcdefgh12";
    await b.w.fetch("/api/notifications");
    await flush();
    expect(JSON.parse(b.w.localStorage.getItem("nga.desktop.seen.v1") ?? "[]")).toEqual(["n1", "n2"]);
    expect(b.calls.filter((c) => c.cmd === "web_notify")).toEqual([]);
  });

  it("drops Task Mentor's captured headers when the school changes (no replay with the old token)", async () => {
    const b = boot({
      app: "taskmentor",
      url: "https://taskmentor.amashuri.com/dashboard",
      cookie: "nga_school=2.abcdefgh12",
      respond: () => notices([])!,
    });
    // Task Mentor polls its overview through axios (XHR); simulate the capture.
    const xhr = new b.w.XMLHttpRequest();
    xhr.open("GET", "/dashboard/student/overview");
    xhr.setRequestHeader("Authorization", "Bearer old-school");
    try { xhr.send(); } catch { /* jsdom has no server */ }
    Object.defineProperty(b.w.document, "hidden", { configurable: true, get: () => true });
    b.w.document.cookie = "nga_school=3.abcdefgh12";
    const before = b.fetches.length;
    await b.tick();
    await flush();
    expect(b.fetches.slice(before).some((f) => f.headers.Authorization === "Bearer old-school")).toBe(false);
  });
});
