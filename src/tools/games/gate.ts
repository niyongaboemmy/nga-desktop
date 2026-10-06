// Can this person play this game now? The whole control model of plan §6.7.5 as
// pure functions, so every rule is unit-tested. MIS resolves who may play what
// (the policy's games block); the desktop applies it, and keeps applying the
// cached copy offline. Exams beat everything; stale data fails closed.
import { evaluate, type GamesBlock, type Policy } from "../shared/policy";
import { kigaliMinutes } from "./seed";
import type { GameKind } from "./types";
import type { Persona } from "../types";

export type LockReason = "stale" | "exam" | "lesson" | "parent" | "off" | "disabled" | "quiet" | "budget" | "cooldown";
export type Gate = { open: true } | { open: false; reason: LockReason; label?: string; until?: number };

/** Play time kept on this computer: seconds per Kigali day per game. */
export interface Usage {
  days: Record<string, Record<string, number>>;
  /** The current play session (any counted game), for the session cap and cool-down. */
  session: { sec: number; last: number; cooldownUntil: number };
}

export const EMPTY_USAGE: Usage = { days: {}, session: { sec: 0, last: 0, cooldownUntil: 0 } };

const hhmm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

/** Minutes until a Kigali "HH:MM" next comes round (1..1440). */
function minutesUntil(clock: string, now: number): number {
  const d = (hhmm(clock) - kigaliMinutes(now) + 1440) % 1440;
  return d === 0 ? 1440 : d;
}

/** Inside quiet hours (start inclusive, end exclusive; may cross midnight)? */
export function inQuietHours(q: [string, string] | null, now: number): boolean {
  if (!q) return false;
  const [a, b] = [hhmm(q[0]), hhmm(q[1])];
  const m = kigaliMinutes(now);
  if (a === b) return false;
  return a < b ? m >= a && m < b : m >= a || m < b;
}

/** The next whole minute when a Kigali clock time comes round. */
export const nextClock = (clock: string, now: number) => Math.floor(now / 60_000) * 60_000 + minutesUntil(clock, now) * 60_000;

/** Minutes counted against the daily budget (learning × 0.5, reset free), as MIS counts them. */
export function weightedMinutes(perGame: Record<string, number> | undefined, learning: readonly string[], reset: readonly string[]): number {
  let s = 0;
  for (const [g, sec] of Object.entries(perGame ?? {})) s += reset.includes(g) ? 0 : learning.includes(g) ? sec / 2 : sec;
  return s / 60;
}

/**
 * Today's minutes for the budget. MIS's figure counts every computer up to the last
 * sync; what this computer played since then is added on top. Never less than what
 * this computer alone has counted.
 */
export function budgetUsed(serverMin: number, localNowMin: number, localAtFetchMin: number): number {
  return Math.max(localNowMin, serverMin + Math.max(0, localNowMin - localAtFetchMin));
}

/** Whose lessons lock games: a student's own lessons, a teacher's own teaching. */
const lessonRole = (p: Persona | null) => (p === "student" ? "attending" : "teaching");

export interface GateInput {
  policy: Policy | null;
  gameId: string;
  kind: GameKind;
  persona: Persona | null;
  now: number;
  /** budgetUsed(…) */
  usedMin: number;
  session: Usage["session"];
}

/** The verdict for one game. Order: reset → stale → exam → lesson → parents → switches → quiet hours → budget → cool-down. */
export function gameGate({ policy, gameId, kind, persona, now, usedMin, session }: GateInput): Gate {
  if (kind === "reset") return { open: true };
  const v = evaluate(policy, now, { lessons: lessonRole(persona) });
  if (!v.open) return { open: false, reason: v.reason, label: v.label, until: v.until ? Date.parse(v.until) : undefined };
  const g: GamesBlock | undefined = policy?.games;
  if (persona === "parent") return { open: false, reason: "parent" };
  if (!g) return { open: true }; // an MIS without the games programme: lessons and exams still lock
  if (!g.enabled) return { open: false, reason: "off" };
  if (!g.allowed.includes(gameId)) return { open: false, reason: "disabled" };
  if (g.quietHours && inQuietHours(g.quietHours, now)) return { open: false, reason: "quiet", until: nextClock(g.quietHours[1], now) };
  if (g.dailyBudgetMin !== null && usedMin >= g.dailyBudgetMin) return { open: false, reason: "budget", until: nextClock("00:00", now) };
  if (now < session.cooldownUntil) return { open: false, reason: "cooldown", until: session.cooldownUntil };
  return { open: true };
}

/**
 * One more counted second (or more) of play. A break as long as the cool-down starts
 * a new session; reaching the session cap starts the cool-down.
 */
export function tickSession(s: Usage["session"], now: number, sec: number, capMin: number, cooldownMin: number): Usage["session"] {
  const fresh = s.last === 0 || now - s.last >= Math.max(1, cooldownMin) * 60_000;
  const total = (fresh ? 0 : s.sec) + sec;
  if (total >= capMin * 60) return { sec: 0, last: now, cooldownUntil: now + cooldownMin * 60_000 };
  return { sec: total, last: now, cooldownUntil: s.cooldownUntil };
}

/** Seconds left in this session (for the chip in the game bar). */
export function sessionLeft(s: Usage["session"], now: number, capMin: number, cooldownMin: number): number {
  const fresh = s.last === 0 || now - s.last >= Math.max(1, cooldownMin) * 60_000;
  return Math.max(0, capMin * 60 - (fresh ? 0 : s.sec));
}

/** Add seconds of one game today; keeps only today and yesterday (what MIS accepts). */
export function addPlay(u: Usage, day: string, yesterday: string, gameId: string, sec: number): Usage {
  const days: Usage["days"] = {};
  for (const d of [yesterday, day]) if (u.days[d]) days[d] = { ...u.days[d] };
  days[day] = { ...(days[day] ?? {}), [gameId]: (days[day]?.[gameId] ?? 0) + sec };
  return { ...u, days };
}

/** The sync body for POST /desktop/tools/games/usage (cumulative totals: retries never double count). */
export function usageEntries(u: Usage): Array<{ day: string; game: string; seconds: number }> {
  return Object.entries(u.days).flatMap(([day, games]) =>
    Object.entries(games).filter(([, s]) => s >= 1).map(([game, s]) => ({ day, game, seconds: Math.floor(s) })),
  );
}

/** Sound is off by default during school hours (weekdays 07:00–17:00 Kigali). */
export function schoolHours(now: number): boolean {
  const day = new Date(now + 2 * 3600_000).getUTCDay();
  const m = kigaliMinutes(now);
  return day >= 1 && day <= 5 && m >= 7 * 60 && m < 17 * 60;
}
