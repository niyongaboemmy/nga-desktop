// When games and the student AI pause: the person's lessons and exam windows today
// (MIS /desktop/tools/policy; plan §6.1). Fetched while online, cached per person so
// the locks still work offline. Pure parts are unit-tested.
import { useEffect, useState } from "react";
import { misCall } from "./api";
import { readPersonal, usePersonal } from "./store";
import type { Identity } from "../types";

export interface LockWindow {
  from: string;
  to: string;
  kind: "lesson" | "exam";
  label: string;
  role?: "teaching" | "attending" | "other";
}

export interface Policy {
  generatedAt: string;
  validUntil: string;
  windows: LockWindow[];
  exam: { active: boolean; until: string | null; label: string | null };
}

export type Verdict = { open: true } | { open: false; reason: "exam" | "lesson" | "stale"; label?: string; until?: string };

/** A cached policy older than this (or from another day) is "stale". */
export const STALE_MS = 24 * 60 * 60 * 1000;

/** Is a game (or other policy-bound tool) allowed now? Exams first; stale data fails closed. */
export function evaluate(p: Policy | null, now: number, opts: { lessons: "attending" | "teaching" | "all" } = { lessons: "attending" }): Verdict {
  if (!p || now - Date.parse(p.generatedAt) > STALE_MS) return { open: false, reason: "stale" };
  const active = (w: LockWindow) => Date.parse(w.from) <= now && now < Date.parse(w.to);
  const exam = p.windows.find((w) => w.kind === "exam" && active(w));
  if (exam) return { open: false, reason: "exam", label: exam.label, until: exam.to };
  const lesson = p.windows.find((w) => w.kind === "lesson" && active(w) && (opts.lessons === "all" || w.role === opts.lessons));
  if (lesson) return { open: false, reason: "lesson", label: lesson.label, until: lesson.to };
  return { open: true };
}

/** The person's policy, refreshed every 10 min while online; the cached one offline. */
export function usePolicy(identity: Identity | null): Policy | null {
  const [cached, setCached] = usePersonal<Policy | null>(identity, "policy.cache", null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  useEffect(() => {
    if (!identity) return;
    let alive = true;
    const load = () =>
      misCall<Policy>({ method: "GET", path: "/desktop/tools/policy", timeoutMs: 20_000 })
        .then((p) => {
          if (!alive || !p) return;
          setPolicy(p);
          setCached(p);
        })
        .catch(() => undefined);
    void load();
    const id = window.setInterval(load, 10 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [identity, setCached]);
  return policy ?? cached;
}

export { readPersonal };
