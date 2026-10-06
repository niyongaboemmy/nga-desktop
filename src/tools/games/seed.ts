// Seeds: one shared daily puzzle for the whole school (plan §6.7.1 #8), and a
// small seeded random generator so a saved game can be replayed exactly.

/** Kigali is UTC+2 all year (no daylight saving). */
const KIGALI_MS = 2 * 60 * 60 * 1000;

/** "YYYY-MM-DD" in Kigali. */
export function kigaliDay(now: number = Date.now()): string {
  return new Date(now + KIGALI_MS).toISOString().slice(0, 10);
}

/** Minutes since midnight in Kigali. */
export function kigaliMinutes(now: number = Date.now()): number {
  const d = new Date(now + KIGALI_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** FNV-1a, 32-bit: the same string always gives the same number. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Today's seed for one game: the same for everyone at school today. */
export const dailySeed = (gameId: string, now: number = Date.now()) => hash(`${kigaliDay(now)}:${gameId}`);

/** A random seed for a new game. */
export const freshSeed = () => (Math.random() * 0x1_0000_0000) >>> 0;

/** mulberry32: a small, fast, seeded generator in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n). */
export const pick = (r: () => number, n: number) => Math.floor(r() * n);

/** A shuffled copy (Fisher–Yates). */
export function shuffle<T>(list: readonly T[], r: () => number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = pick(r, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * One step of a random stream kept *inside* a saved game: returns [value in [0,1), next state].
 * Store the state number in the game state and the game replays exactly after a restore.
 */
export function step(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}
