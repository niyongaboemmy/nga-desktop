import { describe, expect, it } from "vitest";
import { addPlay, budgetUsed, EMPTY_USAGE, gameGate, inQuietHours, nextClock, schoolHours, sessionLeft, tickSession, usageEntries, weightedMinutes, type GateInput } from "./gate";
import type { GamesBlock, Policy } from "../shared/policy";

// 10:00 Kigali on a Monday.
const NOW = Date.parse("2026-10-05T08:00:00Z");
const games: GamesBlock = {
  enabled: true, allowed: ["mines", "pairs", "snake"], dailyBudgetMin: 30, usedTodayMin: 0, sessionCapMin: 10, cooldownMin: 5,
  quietHours: ["21:30", "06:00"], learning: ["pairs"], igisoroVariant: null,
};
const policy = (over: Partial<Policy> = {}, g: Partial<GamesBlock> = {}): Policy => ({
  generatedAt: new Date(NOW - 60_000).toISOString(), validUntil: new Date(NOW + 3600_000).toISOString(),
  windows: [], exam: { active: false, until: null, label: null }, games: { ...games, ...g }, ...over,
});
const input = (over: Partial<GateInput> = {}): GateInput => ({
  policy: policy(), gameId: "mines", kind: "fun", persona: "student", now: NOW, usedMin: 0, session: EMPTY_USAGE.session, ...over,
});
const win = (kind: "lesson" | "exam", role?: "attending" | "teaching") => ({
  from: new Date(NOW - 600_000).toISOString(), to: new Date(NOW + 600_000).toISOString(), kind, label: "Maths S4", role,
});

describe("games gate (plan §6.7.5)", () => {
  it("opens when nothing stands in the way", () => {
    expect(gameGate(input())).toEqual({ open: true });
  });

  it("fails closed with no or stale policy, but resets always open", () => {
    expect(gameGate(input({ policy: null }))).toMatchObject({ open: false, reason: "stale" });
    expect(gameGate(input({ policy: policy({ generatedAt: new Date(NOW - 25 * 3600_000).toISOString() }) }))).toMatchObject({ reason: "stale" });
    expect(gameGate(input({ policy: null, gameId: "breathe", kind: "reset" }))).toEqual({ open: true });
  });

  it("exam beats everything, then the person's own lessons", () => {
    const p = policy({ windows: [win("lesson", "attending"), win("exam")] });
    expect(gameGate(input({ policy: p }))).toMatchObject({ reason: "exam", label: "Maths S4", until: NOW + 600_000 });
    expect(gameGate(input({ policy: policy({ windows: [win("lesson", "attending")] }) }))).toMatchObject({ reason: "lesson" });
    // A teacher is locked while teaching, not by lessons where they are not teaching.
    expect(gameGate(input({ persona: "teacher", policy: policy({ windows: [win("lesson", "attending")] }) }))).toEqual({ open: true });
    expect(gameGate(input({ persona: "teacher", policy: policy({ windows: [win("lesson", "teaching")] }) }))).toMatchObject({ reason: "lesson" });
  });

  it("applies the school's switches", () => {
    expect(gameGate(input({ persona: "parent" }))).toMatchObject({ reason: "parent" });
    expect(gameGate(input({ policy: policy({}, { enabled: false }) }))).toMatchObject({ reason: "off" });
    expect(gameGate(input({ gameId: "igisoro" }))).toMatchObject({ reason: "disabled" });
  });

  it("rests in quiet hours, across midnight, until they end", () => {
    const night = Date.parse("2026-10-05T20:00:00Z"); // 22:00 Kigali
    const g = gameGate(input({ now: night, policy: policy({ generatedAt: new Date(night).toISOString() }) }));
    expect(g).toMatchObject({ reason: "quiet", until: Date.parse("2026-10-06T04:00:00Z") });
    expect(inQuietHours(["21:30", "06:00"], Date.parse("2026-10-06T03:59:00Z"))).toBe(true);
    expect(inQuietHours(["21:30", "06:00"], Date.parse("2026-10-06T04:00:00Z"))).toBe(false);
    expect(inQuietHours(["12:00", "13:00"], Date.parse("2026-10-05T10:30:00Z"))).toBe(true);
    expect(inQuietHours(null, NOW)).toBe(false);
  });

  it("stops at the daily budget (none for staff), then the cool-down", () => {
    expect(gameGate(input({ usedMin: 30 }))).toMatchObject({ reason: "budget", until: nextClock("00:00", NOW) });
    expect(gameGate(input({ usedMin: 300, persona: "teacher", policy: policy({}, { dailyBudgetMin: null }) }))).toEqual({ open: true });
    expect(gameGate(input({ session: { sec: 0, last: NOW, cooldownUntil: NOW + 60_000 } }))).toMatchObject({ reason: "cooldown", until: NOW + 60_000 });
  });

  it("still locks lessons and exams with an MIS that has no games block", () => {
    expect(gameGate(input({ policy: { ...policy(), games: undefined } }))).toEqual({ open: true });
    expect(gameGate(input({ policy: { ...policy({ windows: [win("exam")] }), games: undefined } }))).toMatchObject({ reason: "exam" });
  });
});

describe("play time", () => {
  it("weights minutes like MIS (learning half, reset free)", () => {
    expect(weightedMinutes({ mines: 600, pairs: 600, breathe: 600 }, ["pairs"], ["breathe"])).toBe(15);
    expect(weightedMinutes(undefined, [], [])).toBe(0);
  });

  it("adds what this computer played since the last sync to MIS's total", () => {
    expect(budgetUsed(20, 5, 5)).toBe(20); // synced: MIS already has it
    expect(budgetUsed(20, 8, 5)).toBe(23); // 3 min since the last sync
    expect(budgetUsed(0, 12, 0)).toBe(12); // offline all day
    expect(budgetUsed(2, 12, 12)).toBe(12); // never less than this computer alone
  });

  it("caps a session, cools down, and a long break starts afresh", () => {
    let s = EMPTY_USAGE.session;
    let t = NOW;
    for (let i = 0; i < 599; i++) s = tickSession(s, (t += 1000), 1, 10, 5);
    expect(s.sec).toBe(599);
    expect(sessionLeft(s, t, 10, 5)).toBe(1);
    s = tickSession(s, (t += 1000), 1, 10, 5);
    expect(s).toEqual({ sec: 0, last: t, cooldownUntil: t + 300_000 });
    // A 5-minute break: the next session starts from zero.
    const later = tickSession({ sec: 300, last: NOW, cooldownUntil: 0 }, NOW + 300_000, 1, 10, 5);
    expect(later.sec).toBe(1);
    expect(sessionLeft({ sec: 300, last: NOW, cooldownUntil: 0 }, NOW + 300_000, 10, 5)).toBe(600);
  });

  it("keeps today and yesterday only, and syncs whole seconds", () => {
    let u = addPlay(EMPTY_USAGE, "2026-10-03", "2026-10-02", "mines", 30);
    u = addPlay(u, "2026-10-04", "2026-10-03", "mines", 10.6);
    u = addPlay(u, "2026-10-05", "2026-10-04", "snake", 5);
    u = addPlay(u, "2026-10-05", "2026-10-04", "snake", 5);
    expect(Object.keys(u.days).sort()).toEqual(["2026-10-04", "2026-10-05"]);
    expect(usageEntries(u)).toEqual([
      { day: "2026-10-04", game: "mines", seconds: 10 },
      { day: "2026-10-05", game: "snake", seconds: 10 },
    ]);
  });

  it("knows school hours (sound off by default)", () => {
    expect(schoolHours(NOW)).toBe(true); // Monday 10:00
    expect(schoolHours(Date.parse("2026-10-04T08:00:00Z"))).toBe(false); // Sunday
    expect(schoolHours(Date.parse("2026-10-05T16:00:00Z"))).toBe(false); // 18:00
  });
});
