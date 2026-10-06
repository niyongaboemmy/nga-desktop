// The games programme's live state for one person: the school's rules (policy),
// play time on this computer, and the sync with NGA MIS (plan §6.7.5). Play time is
// sent as cumulative totals per day and game, so a retry never counts twice; MIS adds
// up every computer the person uses, so changing PCs doesn't reset the budget.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { misCall } from "../shared/api";
import { usePersonal } from "../shared/store";
import type { Policy } from "../shared/policy";
import { addPlay, budgetUsed, EMPTY_USAGE, gameGate, tickSession, usageEntries, weightedMinutes, type Gate, type Usage } from "./gate";
import { LEARNING_IDS, RESET_IDS } from "./catalog";
import { kigaliDay } from "./seed";
import type { GameDef } from "./types";
import type { Identity } from "../types";

const DEVICE_KEY = "nga.games.device";

/** A random id for this computer (MIS keeps the largest total per device). */
export function deviceId(): string {
  try {
    const v = localStorage.getItem(DEVICE_KEY);
    if (v && /^[a-z0-9]{8,16}$/.test(v)) return v;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return "nostorage01";
  }
}

interface Cached {
  policy: Policy;
  /** This computer's weighted minutes today when the policy was fetched. */
  atFetch: number;
}

export interface GamesState {
  ready: boolean;
  policy: Policy | null;
  usage: Usage;
  /** Minutes counted against today's budget. */
  usedMin: number;
  now: number;
  gate: (def: Pick<GameDef, "id" | "kind">) => Gate;
  /** One counted second of play (the shell calls it while a game is really being played). */
  count: (def: Pick<GameDef, "id" | "kind">, sec: number) => void;
  sync: () => Promise<void>;
}

export function useGames(identity: Identity | null): GamesState {
  const [usage, setUsage, usageReady] = usePersonal<Usage>(identity, "games.usage", EMPTY_USAGE);
  const [cached, setCached, cacheReady] = usePersonal<Cached | null>(identity, "games.policy", null);
  const [now, setNow] = useState(() => Date.now());
  const usageRef = useRef(usage);
  usageRef.current = usage;

  // Locks open and close on their own (end of a lesson, end of a cool-down).
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);

  const today = kigaliDay(now);
  const localToday = (u: Usage) => weightedMinutes(u.days[kigaliDay()], LEARNING_IDS, RESET_IDS);

  const sync = useCallback(async () => {
    if (!identity) return;
    const entries = usageEntries(usageRef.current);
    if (entries.length) {
      await misCall({ method: "POST", path: "/desktop/tools/games/usage", body: { device: deviceId(), entries }, timeoutMs: 20_000 }).catch(() => undefined);
    }
    const atFetch = localToday(usageRef.current);
    const p = await misCall<Policy>({ method: "GET", path: "/desktop/tools/policy", timeoutMs: 20_000 }).catch(() => null);
    if (p) setCached({ policy: p, atFetch });
  }, [identity, setCached]);

  // The policy every minute (a teacher's class game time shows up quickly); play time every 5.
  const refresh = useCallback(async () => {
    if (!identity) return;
    const atFetch = localToday(usageRef.current);
    const p = await misCall<Policy>({ method: "GET", path: "/desktop/tools/policy", timeoutMs: 20_000 }).catch(() => null);
    if (p) setCached({ policy: p, atFetch });
  }, [identity, setCached]);

  useEffect(() => {
    if (!identity || !usageReady) return;
    void sync();
    let n = 0;
    const id = window.setInterval(() => void (++n % 5 === 0 ? sync() : refresh()), 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity?.userId, usageReady]);

  const policy = cached?.policy ?? null;
  const usedMin = useMemo(() => {
    const local = weightedMinutes(usage.days[today], LEARNING_IDS, RESET_IDS);
    // A policy from another day says nothing about today's minutes.
    const fresh = policy && kigaliDay(Date.parse(policy.generatedAt)) === today;
    return budgetUsed(fresh ? policy.games?.usedTodayMin ?? 0 : 0, local, fresh ? cached?.atFetch ?? 0 : 0);
  }, [usage, today, policy, cached]);

  const gate = useCallback(
    (def: Pick<GameDef, "id" | "kind">) =>
      gameGate({ policy, gameId: def.id, kind: def.kind, persona: identity?.persona ?? null, now, usedMin, session: usage.session }),
    [policy, identity, now, usedMin, usage.session],
  );

  const g = policy?.games;
  const student = identity?.persona === "student";
  const count = useCallback(
    (def: Pick<GameDef, "id" | "kind">, sec: number) => {
      const t = Date.now();
      // Class game time is the teacher's time: it doesn't count towards budgets or sessions.
      const gt = gameGate({ policy, gameId: def.id, kind: def.kind, persona: identity?.persona ?? null, now: t, usedMin: 0, session: EMPTY_USAGE.session });
      if (gt.open && gt.classTime) return;
      setUsage((u) => {
        const day = kigaliDay(t);
        const next = addPlay(u, day, kigaliDay(t - 86_400_000), def.id, sec);
        // Students' sessions are capped (staff play without a cap; resets never count).
        if (!student || def.kind === "reset") return next;
        return { ...next, session: tickSession(u.session, t, sec, g?.sessionCapMin ?? 10, g?.cooldownMin ?? 5) };
      });
    },
    [setUsage, student, g?.sessionCapMin, g?.cooldownMin, policy, identity?.persona],
  );

  return { ready: usageReady && cacheReady, policy, usage, usedMin, now, gate, count, sync };
}
