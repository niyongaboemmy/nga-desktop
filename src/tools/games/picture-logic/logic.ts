// Picture logic (a nonogram): seeded pictures that a line-by-line solver can finish
// without guessing, so every puzzle has one answer reachable by reasoning. Pure and serialisable.
import { step } from "../seed";

export type Size = 5 | 10 | 15;
/** Cell marks on the player's board. */
export const EMPTY = 0, FILLED = 1, CROSSED = 2;

export interface State {
  n: Size;
  daily: boolean;
  seed: number;
  /** n*n, row by row: 1 = part of the picture. */
  picture: number[];
  rows: number[][];
  cols: number[][];
  /** The player's marks (EMPTY / FILLED / CROSSED). */
  marks: number[];
  seconds: number;
  solved: boolean;
}

/** The runs of filled cells in a line ([] for a blank line). */
export function clue(line: number[]): number[] {
  const out: number[] = [];
  let run = 0;
  for (const v of line) {
    if (v === 1) run++;
    else if (run) { out.push(run); run = 0; }
  }
  if (run) out.push(run);
  return out;
}

export const rowOf = (g: number[], n: number, r: number) => g.slice(r * n, r * n + n);
export const colOf = (g: number[], n: number, c: number) => Array.from({ length: n }, (_, r) => g[r * n + c]);

/**
 * Everything one line's clue forces, given what is known (-1 unknown, 0 empty, 1 filled).
 * Returns the line with forced cells set, or null if no placement fits.
 */
export function solveLine(clueRuns: number[], cells: number[]): number[] | null {
  const L = cells.length, k = clueRuns.length;
  // fits[pos][b]: blocks b.. can be placed in cells pos.. (memoised).
  const memo = new Map<number, boolean>();
  const fits = (pos: number, b: number): boolean => {
    if (pos >= L) return b === k;
    const key = pos * (k + 1) + b;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let ok = false;
    if (cells[pos] !== 1 && fits(pos + 1, b)) ok = true;
    if (!ok && b < k && canBlock(pos, clueRuns[b])) ok = fits(pos + clueRuns[b] + 1, b + 1);
    memo.set(key, ok);
    return ok;
  };
  const canBlock = (pos: number, len: number) => {
    if (pos + len > L) return false;
    for (let i = pos; i < pos + len; i++) if (cells[i] === 0) return false;
    return pos + len === L || cells[pos + len] !== 1;
  };
  if (!fits(0, 0)) return null;
  const canFill = Array(L).fill(false), canEmpty = Array(L).fill(false);
  const seen = new Set<number>();
  const walk = (pos: number, b: number) => {
    if (pos >= L) return;
    const key = pos * (k + 1) + b;
    if (seen.has(key)) return;
    seen.add(key);
    if (cells[pos] !== 1 && fits(pos + 1, b)) {
      canEmpty[pos] = true;
      walk(pos + 1, b);
    }
    if (b < k && canBlock(pos, clueRuns[b]) && fits(pos + clueRuns[b] + 1, b + 1)) {
      const end = pos + clueRuns[b];
      for (let i = pos; i < end; i++) canFill[i] = true;
      if (end < L) canEmpty[end] = true;
      walk(end + 1, b + 1);
    }
  };
  walk(0, 0);
  return cells.map((v, i) => (canFill[i] && canEmpty[i] ? v : canFill[i] ? 1 : 0));
}

/** Line-by-line solving until nothing changes. Unknown cells stay -1; null on a contradiction. */
export function lineSolve(rows: number[][], cols: number[][]): number[] | null {
  const n = rows.length;
  const g = Array(n * n).fill(-1);
  let dirty = true;
  while (dirty) {
    dirty = false;
    for (let r = 0; r < n; r++) {
      const out = solveLine(rows[r], rowOf(g, n, r));
      if (!out) return null;
      out.forEach((v, c) => { if (g[r * n + c] !== v) { g[r * n + c] = v; dirty = true; } });
    }
    for (let c = 0; c < n; c++) {
      const out = solveLine(cols[c], colOf(g, n, c));
      if (!out) return null;
      out.forEach((v, r) => { if (g[r * n + c] !== v) { g[r * n + c] = v; dirty = true; } });
    }
  }
  return g;
}

export function cluesOf(picture: number[], n: number) {
  return {
    rows: Array.from({ length: n }, (_, r) => clue(rowOf(picture, n, r))),
    cols: Array.from({ length: n }, (_, c) => clue(colOf(picture, n, c))),
  };
}

/** A random ~55% picture, redrawn until the line solver finishes it without guessing. */
export function makePicture(seed: number, n: Size): number[] {
  let r = seed >>> 0;
  for (;;) {
    const pic: number[] = [];
    for (let i = 0; i < n * n; i++) {
      const [v, r1] = step(r);
      r = r1;
      pic.push(v < 0.55 ? 1 : 0);
    }
    if (!pic.some((v) => v)) continue;
    const { rows, cols } = cluesOf(pic, n);
    const g = lineSolve(rows, cols);
    if (g && g.every((v, i) => v === pic[i])) return pic;
  }
}

export function newGame(seed: number, n: Size = 10, daily = false): State {
  const picture = makePicture(seed, n);
  return { n, daily, seed: seed >>> 0, picture, ...cluesOf(picture, n), marks: Array(n * n).fill(EMPTY), seconds: 0, solved: false };
}

const filledOnly = (marks: number[]) => marks.map((m) => (m === FILLED ? 1 : 0));

/** Set one cell's mark (a drag paints the same mark along a line). */
export function mark(s: State, i: number, m: number): State {
  if (s.solved || i < 0 || i >= s.n * s.n || s.marks[i] === m) return s;
  const marks = s.marks.slice();
  marks[i] = m;
  // Won when the filled cells match the picture (crosses are optional).
  const solved = marks.every((v, k) => (v === FILLED ? 1 : 0) === s.picture[k]);
  return { ...s, marks, solved };
}

/** Is this row's / column's clue met by the player's filled cells? */
export const rowDone = (s: State, r: number) => clue(rowOf(filledOnly(s.marks), s.n, r)).join() === s.rows[r].join();
export const colDone = (s: State, c: number) => clue(colOf(filledOnly(s.marks), s.n, c)).join() === s.cols[c].join();

export function clear(s: State): State {
  return { ...s, marks: Array(s.n * s.n).fill(EMPTY), solved: false };
}
