// Number place (a 9×9 sudoku with a unique solution). Our own generator: a seeded
// full grid, then cells removed while a solution counter still finds exactly one.
// Pure and serialisable.
import { rng, shuffle } from "../seed";

export type Level = "easy" | "medium" | "hard" | "expert";
export type Mode = Level | "daily";
/** Target number of givens per level (the generator stops at the target or when no cell can go). */
export const GIVENS: Record<Level, number> = { easy: 40, medium: 34, hard: 29, expert: 25 };
export const HINTS = 3;

export interface State {
  mode: Mode;
  seed: number;
  /** 81 cells, row by row; 0 is empty. The givens. */
  puzzle: number[];
  solution: number[];
  /** What is on the board now (givens included). */
  values: number[];
  /** Pencil notes per cell: bit d (1..9) set means d is noted. */
  notes: number[];
  /** Cells filled by a hint. */
  hinted: number[];
  hintsLeft: number;
  seconds: number;
  solved: boolean;
}

export const row = (i: number) => Math.floor(i / 9);
export const col = (i: number) => i % 9;
export const box = (i: number) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);
export const peers = (i: number, j: number) => i !== j && (row(i) === row(j) || col(i) === col(j) || box(i) === box(j));

const ALL = 0x3fe; // bits 1..9
const bits = (m: number) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };

/**
 * Count the solutions of a grid, stopping at `limit`. With `order`, digits are tried in
 * that order and the first solution is written into `out` (used to fill a random grid).
 */
export function countSolutions(grid: number[], limit = 2, order?: number[], out?: number[]): number {
  const g = grid.slice();
  const rows = Array(9).fill(0), cols = Array(9).fill(0), boxes = Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = g[i];
    if (!v) continue;
    const b = 1 << v;
    if (rows[row(i)] & b || cols[col(i)] & b || boxes[box(i)] & b) return 0;
    rows[row(i)] |= b; cols[col(i)] |= b; boxes[box(i)] |= b;
  }
  const digits = order ?? [1, 2, 3, 4, 5, 6, 7, 8, 9];
  let found = 0;
  const go = (): boolean => {
    // The empty cell with the fewest candidates.
    let best = -1, bestMask = 0, bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = ALL & ~(rows[row(i)] | cols[col(i)] | boxes[box(i)]);
      const c = bits(m);
      if (c < bestCount) { best = i; bestMask = m; bestCount = c; if (c <= 1) break; }
    }
    if (best < 0) {
      found++;
      if (out && found === 1) for (let i = 0; i < 81; i++) out[i] = g[i];
      return found >= limit;
    }
    if (!bestCount) return false;
    const r = row(best), c = col(best), x = box(best);
    for (const d of digits) {
      const b = 1 << d;
      if (!(bestMask & b)) continue;
      g[best] = d; rows[r] |= b; cols[c] |= b; boxes[x] |= b;
      const stop = go();
      g[best] = 0; rows[r] &= ~b; cols[c] &= ~b; boxes[x] &= ~b;
      if (stop) return true;
    }
    return false;
  };
  go();
  return found;
}

/** One try: a random full grid, then remove cells (in random order) while the solution stays unique. */
function attempt(r: () => number, target: number): { puzzle: number[]; solution: number[] } {
  const solution = Array(81).fill(0);
  countSolutions(Array(81).fill(0), 1, shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], r), solution);
  // Shuffle the digit labels too, so the fill's bias does not show.
  const relabel = [0, ...shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], r)];
  for (let i = 0; i < 81; i++) solution[i] = relabel[solution[i]];
  const puzzle = solution.slice();
  let givens = 81;
  for (const i of shuffle(Array.from({ length: 81 }, (_, k) => k), r)) {
    if (givens <= target) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle, 2) === 1) givens--;
    else puzzle[i] = keep;
  }
  return { puzzle, solution };
}

/**
 * A puzzle and its solution from a seed. A removal pass can get stuck above the target
 * (every remaining given is needed), so up to 12 fresh grids are tried and the sparsest kept.
 */
export function generate(seed: number, level: Level): { puzzle: number[]; solution: number[] } {
  const r = rng(seed);
  const target = GIVENS[level];
  const givens = (p: number[]) => p.filter(Boolean).length;
  let best = attempt(r, target);
  for (let k = 0; k < 11 && givens(best.puzzle) > target; k++) {
    const next = attempt(r, target);
    if (givens(next.puzzle) < givens(best.puzzle)) best = next;
  }
  return best;
}

export function newGame(seed: number, mode: Mode = "easy"): State {
  const { puzzle, solution } = generate(seed, mode === "daily" ? "medium" : mode);
  return {
    mode, seed: seed >>> 0, puzzle, solution, values: puzzle.slice(), notes: Array(81).fill(0),
    hinted: [], hintsLeft: HINTS, seconds: 0, solved: false,
  };
}

const done = (s: State): State => ({ ...s, solved: s.values.every((v, i) => v === s.solution[i]) });

/** Put digit d in cell i (clears its notes and that digit from the notes of its peers). */
export function setValue(s: State, i: number, d: number): State {
  if (s.solved || s.puzzle[i] || d < 1 || d > 9 || s.values[i] === d) return s;
  const values = s.values.slice();
  values[i] = d;
  const notes = s.notes.map((m, j) => (j === i ? 0 : peers(i, j) ? m & ~(1 << d) : m));
  return done({ ...s, values, notes });
}

/** Toggle a pencil note in an empty cell. */
export function toggleNote(s: State, i: number, d: number): State {
  if (s.solved || s.values[i] || d < 1 || d > 9) return s;
  const notes = s.notes.slice();
  notes[i] ^= 1 << d;
  return { ...s, notes };
}

export function erase(s: State, i: number): State {
  if (s.solved || s.puzzle[i] || (!s.values[i] && !s.notes[i])) return s;
  const values = s.values.slice();
  const notes = s.notes.slice();
  values[i] = 0;
  notes[i] = 0;
  return { ...s, values, notes, hinted: s.hinted.filter((j) => j !== i) };
}

/** Fill one cell with its correct digit: the chosen cell if it is empty or wrong, else the first such cell. */
export function hint(s: State, at: number): State {
  if (s.solved || s.hintsLeft <= 0) return s;
  const need = (i: number) => s.values[i] !== s.solution[i];
  const i = need(at) ? at : s.values.findIndex((_, k) => need(k));
  if (i < 0) return s;
  const next = setValue({ ...s, values: s.values.map((v, k) => (k === i ? 0 : v)) }, i, s.solution[i]);
  return { ...next, hinted: [...s.hinted, i], hintsLeft: s.hintsLeft - 1 };
}

/** 1 where a digit repeats in its row, column or box. */
export function conflicts(values: number[]): number[] {
  const out = Array(81).fill(0);
  for (let i = 0; i < 81; i++) {
    if (!values[i]) continue;
    for (let j = i + 1; j < 81; j++) if (values[j] === values[i] && peers(i, j)) out[i] = out[j] = 1;
  }
  return out;
}

/** Does a full grid follow the rules? */
export function isValidGrid(g: number[]): boolean {
  return g.length === 81 && g.every((v) => v >= 1 && v <= 9) && conflicts(g).every((v) => !v);
}
