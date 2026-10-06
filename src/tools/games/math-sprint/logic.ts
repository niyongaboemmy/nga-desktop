// Math sprint: as many questions as possible in 60 seconds. The timer IS the game.
// Questions come from a random stream stored in the state, so a saved round replays exactly.
import { step } from "../seed";

export const ROUND_MS = 60_000;
export const LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type Level = (typeof LEVELS)[number];

export interface Question {
  /** Shown as is (× ÷ − √ and superscripts). */
  text: string;
  answer: number;
}

export interface Last {
  text: string;
  answer: number;
  given: string;
  ok: boolean;
}

export interface State {
  level: Level;
  /** ready: pick a level · run: the clock runs · over: time is up. */
  phase: "ready" | "run" | "over";
  /** The random stream (seed.ts step). */
  r: number;
  q: Question;
  score: number;
  answered: number;
  /** Milliseconds left in the round. */
  left: number;
  /** The previous question, shown briefly (right answer on a miss). */
  last: Last | null;
}

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
export const sup = (n: number) => String(n).split("").map((c) => SUP[c] ?? c).join("");
/** A number as shown: a real minus sign, brackets for negatives inside an expression. */
export const num = (n: number) => (n < 0 ? `−${-n}` : String(n));
const par = (n: number) => (n < 0 ? `(${num(n)})` : num(n));

/** A tiny random source over a stored state number. */
class Rand {
  constructor(public r: number) {}
  next(): number {
    const [v, r] = step(this.r);
    this.r = r;
    return v;
  }
  /** Integer in [a, b]. */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  of<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)];
  }
}

type Gen = (g: Rand) => Question;

const add: Gen = (g) => { const a = g.int(2, 50), b = g.int(2, 49); return { text: `${a} + ${b}`, answer: a + b }; };
const sub: Gen = (g) => { const a = g.int(10, 99), b = g.int(1, a); return { text: `${a} − ${b}`, answer: a - b }; };
const table = (max: number): Gen => (g) => { const a = g.int(2, max), b = g.int(2, max); return { text: `${a} × ${b}`, answer: a * b }; };
const divide: Gen = (g) => { const b = g.int(2, 12), q = g.int(2, 12); return { text: `${b * q} ÷ ${b}`, answer: q }; };
const add3: Gen = (g) => { const a = g.int(100, 500), b = g.int(10, 99); return g.next() < 0.5 ? { text: `${a} + ${b}`, answer: a + b } : { text: `${a} − ${b}`, answer: a - b }; };

const negAddSub: Gen = (g) => {
  const a = g.int(-20, 20), b = g.int(-20, 20);
  return g.next() < 0.5 ? { text: `${num(a)} + ${par(b)}`, answer: a + b } : { text: `${num(a)} − ${par(b)}`, answer: a - b };
};
const sign = (g: Rand) => (g.next() < 0.5 ? -1 : 1);
const negMul: Gen = (g) => { const a = g.int(2, 12) * sign(g), b = g.int(2, 9) * sign(g); return { text: `${par(a)} × ${par(b)}`, answer: a * b }; };
const square = (max: number): Gen => (g) => { const a = g.int(2, max); return { text: `${a}²`, answer: a * a }; };
/** Mixed operations: × before + and −. */
const mixed: Gen = (g) => {
  const a = g.int(2, 20), b = g.int(2, 9), c = g.int(2, 9);
  return g.next() < 0.5 ? { text: `${a} + ${b} × ${c}`, answer: a + b * c } : { text: `${b} × ${c} − ${a}`, answer: b * c - a };
};
/** p% of a multiple of 20: always a whole answer. "{of}" is translated by the view. */
const percent: Gen = (g) => {
  const p = g.of([5, 10, 20, 25, 30, 40, 50, 75]);
  const base = 20 * g.int(1, 25);
  return { text: `${p}% {of} ${base}`, answer: (p * base) / 100 };
};
const power: Gen = (g) => {
  const [b, e] = g.of([[2, g.int(2, 10)], [3, g.int(2, 5)], [4, g.int(2, 4)], [5, g.int(2, 4)], [10, g.int(2, 6)], [g.int(6, 9), 2], [-2, g.int(2, 5)]] as const);
  return { text: b < 0 ? `(${num(b)})${sup(e)}` : `${b}${sup(e)}`, answer: b ** e };
};
const root: Gen = (g) => { const a = g.int(2, 20); return { text: `√${a * a}`, answer: a }; };
const equation = (neg: boolean): Gen => (g) => {
  const a = g.int(2, 9), x = neg ? g.int(-9, 12) : g.int(1, 12), b = g.int(neg ? -15 : 1, 20) || 3;
  const lhs = b < 0 ? `${a}x − ${-b}` : `${a}x + ${b}`;
  return { text: `${lhs} = ${num(a * x + b)}   x = ?`, answer: x };
};
const log10: Gen = (g) => {
  const e = g.int(-3, 6);
  const arg = e >= 0 ? String(10 ** e) : `0.${"0".repeat(-e - 1)}1`;
  return { text: `log ${arg}`, answer: e };
};

const MIX: Record<Level, Gen[]> = {
  1: [add, sub, table(10), table(10)],
  2: [add3, sub, table(12), divide],
  3: [negAddSub, negMul, square(15), mixed],
  4: [negAddSub, mixed, square(20), percent, percent],
  5: [power, root, equation(false), square(20)],
  6: [power, root, equation(true), log10, log10],
};

/** The next question for a level; returns it with the new stream state. */
export function question(level: Level, r: number): [Question, number] {
  const g = new Rand(r);
  const kind = g.of(MIX[level]);
  const q = kind(g);
  return [{ ...q, answer: q.answer === 0 ? 0 : q.answer }, g.r];
}

export function newRound(level: Level, seed: number): State {
  const [q, r] = question(level, seed >>> 0);
  return { level, phase: "ready", r, q, score: 0, answered: 0, left: ROUND_MS, last: null };
}

export const start = (s: State): State => (s.phase === "ready" ? { ...s, phase: "run" } : s);

/** Read a typed answer: "−5", "-5", " 12 " → number (null if not a number). */
export function parseAnswer(text: string): number | null {
  const t = text.trim().replace(/[−–]/g, "-").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Submit an answer: right or wrong, the next question comes at once. */
export function answer(s: State, text: string): State {
  if (s.phase !== "run") return s;
  const v = parseAnswer(text);
  if (v === null) return s;
  const ok = v === s.q.answer;
  const [q, r] = question(s.level, s.r);
  return {
    ...s, q, r,
    score: s.score + (ok ? 1 : 0),
    answered: s.answered + 1,
    last: { text: s.q.text, answer: s.q.answer, given: text.trim(), ok },
  };
}

/** The clock moved on by ms (only while running). */
export function tick(s: State, ms: number): State {
  if (s.phase !== "run" || ms <= 0) return s;
  const left = Math.max(0, s.left - ms);
  return { ...s, left, phase: left === 0 ? "over" : "run" };
}
