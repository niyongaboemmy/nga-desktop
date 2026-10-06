// Lights out (classic 5×5 toggle puzzle; own look). Pure and serialisable.
import { step } from "../seed";

export const N = 5;
export type Level = "easy" | "medium" | "hard";
/** How many random presses scramble the solved board. */
export const PRESSES: Record<Level, number> = { easy: 4, medium: 8, hard: 13 };

export interface State {
  level: Level;
  /** 25 cells, row by row; 1 is lit. */
  cells: number[];
  /** The board this game started from (for "start again"). */
  start: number[];
  moves: number;
  hints: number;
  /** Seconds played (counted only while not paused). */
  seconds: number;
  solved: boolean;
}

/** The cells one press toggles: itself and its 4 neighbours. */
export function neighbours(i: number, n = N): number[] {
  const r = Math.floor(i / n), c = i % n;
  const out = [i];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
}

export function toggle(cells: number[], i: number): number[] {
  const next = cells.slice();
  for (const j of neighbours(i)) next[j] ^= 1;
  return next;
}

export function newGame(seed: number, level: Level = "easy"): State {
  let r = seed >>> 0;
  for (;;) {
    const picked: number[] = [];
    while (picked.length < PRESSES[level]) {
      const [v, r1] = step(r);
      r = r1;
      const i = Math.floor(v * N * N);
      if (!picked.includes(i)) picked.push(i);
    }
    let cells: number[] = Array(N * N).fill(0);
    for (const i of picked) cells = toggle(cells, i);
    if (cells.some((v) => v)) return { level, cells, start: cells.slice(), moves: 0, hints: 0, seconds: 0, solved: false };
  }
}

export function press(s: State, i: number): State {
  if (s.solved || i < 0 || i >= N * N) return s;
  const cells = toggle(s.cells, i);
  return { ...s, cells, moves: s.moves + 1, solved: cells.every((v) => !v) };
}

export function restart(s: State): State {
  return { ...s, cells: s.start.slice(), moves: 0, solved: false };
}

/**
 * The fewest presses that switch every light off (GF(2) Gaussian elimination,
 * then the smallest of the solutions over the free variables). null: unsolvable.
 */
export function solve(cells: number[], n = N): number[] | null {
  const m = n * n;
  // Augmented rows: m coefficients + the right-hand side.
  const rows: number[][] = Array.from({ length: m }, (_, i) => {
    const row = Array(m + 1).fill(0);
    for (const j of neighbours(i, n)) row[j] = 1;
    row[m] = cells[i] ? 1 : 0;
    return row;
  });
  const pivotCol: number[] = [];
  let rank = 0;
  for (let col = 0; col < m && rank < m; col++) {
    const p = rows.findIndex((row, k) => k >= rank && row[col]);
    if (p < 0) continue;
    [rows[rank], rows[p]] = [rows[p], rows[rank]];
    for (let k = 0; k < m; k++) {
      if (k !== rank && rows[k][col]) for (let c = col; c <= m; c++) rows[k][c] ^= rows[rank][c];
    }
    pivotCol.push(col);
    rank++;
  }
  for (let k = rank; k < m; k++) if (rows[k][m]) return null;
  const free = Array.from({ length: m }, (_, c) => c).filter((c) => !pivotCol.includes(c));
  let best: number[] | null = null;
  for (let mask = 0; mask < 1 << free.length; mask++) {
    const x = Array(m).fill(0);
    free.forEach((c, b) => (x[c] = (mask >> b) & 1));
    for (let k = rank - 1; k >= 0; k--) {
      let v = rows[k][m];
      for (let c = pivotCol[k] + 1; c < m; c++) if (rows[k][c]) v ^= x[c];
      x[pivotCol[k]] = v;
    }
    if (!best || x.reduce((a, b) => a + b, 0) < best.reduce((a, b) => a + b, 0)) best = x;
  }
  return best;
}

/** One cell to press next on the way to a solution (null when solved/unsolvable). */
export function hint(cells: number[]): number | null {
  const x = solve(cells);
  if (!x) return null;
  const i = x.indexOf(1);
  return i < 0 ? null : i;
}
