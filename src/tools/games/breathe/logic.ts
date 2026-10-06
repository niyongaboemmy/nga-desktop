// Box breathing: in, hold, out, hold — 4 seconds each (or a gentler 4-2-6-2 pattern).
export type Phase = "in" | "holdIn" | "out" | "holdOut";

export interface Pattern {
  id: "box" | "calm";
  phases: Array<[Phase, number]>;
}

export const PATTERNS: Pattern[] = [
  { id: "box", phases: [["in", 4], ["holdIn", 4], ["out", 4], ["holdOut", 4]] },
  { id: "calm", phases: [["in", 4], ["holdIn", 2], ["out", 6], ["holdOut", 2]] },
];

export interface State {
  pattern: Pattern["id"];
  /** Total minutes chosen. */
  minutes: 1 | 2;
  /** Seconds breathed so far (null: not started). */
  elapsed: number | null;
}

export const cycleLength = (p: Pattern) => p.phases.reduce((s, [, n]) => s + n, 0);

/** Where in the pattern `elapsed` seconds falls: the phase, seconds left in it, and progress 0..1. */
export function phaseAt(p: Pattern, elapsed: number): { phase: Phase; left: number; progress: number; cycle: number } {
  const len = cycleLength(p);
  const cycle = Math.floor(elapsed / len);
  let t = elapsed - cycle * len;
  for (const [phase, n] of p.phases) {
    if (t < n) return { phase, left: Math.ceil(n - t), progress: t / n, cycle };
    t -= n;
  }
  return { phase: p.phases[0][0], left: p.phases[0][1], progress: 0, cycle: cycle + 1 };
}

export const done = (s: State) => s.elapsed !== null && s.elapsed >= s.minutes * 60;
