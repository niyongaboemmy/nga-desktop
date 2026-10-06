// Classroom kit logic (pure, unit-tested): fair picking, groups, grades, noise level.

export type Rng = () => number;

export interface Person {
  id: number | string;
  name: string;
}

/**
 * Fair picking: nobody is picked twice until everyone present has had a turn.
 * `picked` holds this round's picks; when everyone present is in it, a new round starts.
 * Returns the person and the updated round.
 */
export function pickFair<T extends Person>(people: T[], picked: Array<T["id"]>, absent: Array<T["id"]>, rng: Rng = Math.random): { person: T | null; picked: Array<T["id"]> } {
  const present = people.filter((p) => !absent.includes(p.id));
  if (!present.length) return { person: null, picked };
  let round = picked.filter((id) => present.some((p) => p.id === id));
  let pool = present.filter((p) => !round.includes(p.id));
  if (!pool.length) {
    round = [];
    pool = present;
  }
  const person = pool[Math.floor(rng() * pool.length)];
  return { person, picked: [...round, person.id] };
}

/** Plain random (repeats allowed). */
export function pickRandom<T extends Person>(people: T[], absent: Array<T["id"]>, rng: Rng = Math.random): T | null {
  const present = people.filter((p) => !absent.includes(p.id));
  return present.length ? present[Math.floor(rng() * present.length)] : null;
}

export function shuffle<T>(list: T[], rng: Rng = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Random groups: `by: "size"` (people per group) or `"count"` (number of groups).
 * Sizes differ by at most one. "Keep apart" pairs end up in different groups when
 * possible (a few reshuffles, then the best found). Returns the groups and how many
 * pairs could not be kept apart.
 */
export function makeGroups<T extends Person>(
  people: T[],
  opts: { by: "size" | "count"; n: number; apart?: Array<[T["id"], T["id"]]> },
  rng: Rng = Math.random,
): { groups: T[][]; clashes: number } {
  if (!people.length) return { groups: [], clashes: 0 };
  const n = Math.max(1, Math.floor(opts.n));
  const count = Math.max(1, Math.min(people.length, opts.by === "size" ? Math.ceil(people.length / n) : n));
  const apart = opts.apart ?? [];
  const clashesOf = (groups: T[][]) =>
    apart.filter(([a, b]) => groups.some((g) => g.some((p) => p.id === a) && g.some((p) => p.id === b))).length;
  let best: T[][] = [];
  let bestClashes = Infinity;
  for (let attempt = 0; attempt < (apart.length ? 200 : 1); attempt++) {
    const order = shuffle(people, rng);
    const groups: T[][] = Array.from({ length: count }, () => []);
    order.forEach((p, i) => groups[i % count].push(p));
    const c = clashesOf(groups);
    if (c < bestClashes) {
      best = groups;
      bestClashes = c;
      if (c === 0) break;
    }
  }
  return { groups: best, clashes: bestClashes };
}

/** Groups as text (to paste into Tupo or Task Mentor). */
export const groupsText = (groups: Person[][], label = "Group") =>
  groups.map((g, i) => `${label} ${i + 1}: ${g.map((p) => p.name).join(", ")}`).join("\n");

// ── Grades ───────────────────────────────────────────────────────────────────

export interface Component {
  name: string;
  /** Weight in % of the final mark. */
  weight: number;
  /** Score obtained, or null when not done yet. */
  score: number | null;
  max: number;
}

export interface Band {
  min: number;
  grade: string;
  label: string;
}

/** Editable defaults; schools set their own scale. */
export const DEFAULT_BANDS: Band[] = [
  { min: 80, grade: "A", label: "Excellent" },
  { min: 70, grade: "B", label: "Very good" },
  { min: 60, grade: "C", label: "Good" },
  { min: 50, grade: "D", label: "Satisfactory" },
  { min: 40, grade: "E", label: "Adequate" },
  { min: 0, grade: "F", label: "Fail" },
];

export interface GradeResult {
  /** % over the components with a score (null when none). */
  current: number | null;
  /** Weight already assessed (%). */
  assessed: number;
  totalWeight: number;
  band: Band | null;
}

const clampPct = (x: number) => Math.max(0, Math.min(100, x));
const round1 = (x: number) => Math.round(x * 10) / 10;

export function computeGrade(components: Component[], bands: Band[] = DEFAULT_BANDS): GradeResult {
  const valid = components.filter((c) => c.weight > 0 && c.max > 0);
  const totalWeight = valid.reduce((s, c) => s + c.weight, 0);
  const done = valid.filter((c) => c.score !== null && Number.isFinite(c.score));
  const assessed = done.reduce((s, c) => s + c.weight, 0);
  if (!assessed) return { current: null, assessed: 0, totalWeight, band: null };
  const earned = done.reduce((s, c) => s + clampPct(((c.score as number) / c.max) * 100) * c.weight, 0);
  const current = round1(earned / assessed);
  return { current, assessed, totalWeight, band: bandFor(current, bands) };
}

export const bandFor = (pct: number, bands: Band[] = DEFAULT_BANDS): Band | null =>
  [...bands].sort((a, b) => b.min - a.min).find((b) => pct >= b.min) ?? null;

/**
 * The average % needed on the components not yet assessed to finish at `target` %.
 * null: nothing left to assess. Can be > 100 (not reachable) or < 0 (already safe).
 */
export function neededFor(components: Component[], target: number): number | null {
  const valid = components.filter((c) => c.weight > 0 && c.max > 0);
  const totalWeight = valid.reduce((s, c) => s + c.weight, 0);
  const left = valid.filter((c) => c.score === null).reduce((s, c) => s + c.weight, 0);
  if (!left || !totalWeight) return null;
  const earned = valid.filter((c) => c.score !== null).reduce((s, c) => s + clampPct(((c.score as number) / c.max) * 100) * c.weight, 0);
  return round1((target * totalWeight - earned) / left);
}

// ── Noise ────────────────────────────────────────────────────────────────────

/** RMS of time-domain samples (−1..1) → a 0–100 loudness level (≈ dBFS mapped −60…0). */
export function levelFromSamples(samples: Float32Array | number[]): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const v of samples) sum += v * v;
  const rms = Math.sqrt(sum / samples.length);
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.round(Math.max(0, Math.min(100, ((db + 60) / 60) * 100)));
}

export type NoiseZone = "quiet" | "ok" | "loud";
export const zoneFor = (level: number, okAt: number, loudAt: number): NoiseZone => (level >= loudAt ? "loud" : level >= okAt ? "ok" : "quiet");

/** Smooth a fast-moving level (exponential moving average). */
export const smooth = (prev: number, next: number, k = 0.2) => prev + (next - prev) * k;

/** A deterministic random generator for tests. */
export function seeded(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
