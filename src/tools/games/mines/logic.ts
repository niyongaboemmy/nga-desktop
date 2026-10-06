// Mines (the classic hidden-mines grid; own calm look). Pure and serialisable.
import { step } from "../seed";

export type Level = "small" | "medium" | "large";
export const LEVELS: Record<Level, { size: number; mines: number }> = {
  small: { size: 9, mines: 10 },
  medium: { size: 12, mines: 24 },
  large: { size: 16, mines: 40 },
};

export type Status = "ready" | "play" | "won" | "lost";

export interface State {
  level: Level;
  size: number;
  mines: number;
  /** size*size, row by row: 1 = mine. All 0 until the first reveal. */
  mine: number[];
  /** 1 = revealed. */
  open: number[];
  /** 1 = flagged. */
  flag: number[];
  status: Status;
  /** The mine that was revealed on a loss (-1 otherwise). */
  hit: number;
  /** The random stream (seed.ts step), used once at the first reveal. */
  r: number;
  seconds: number;
}

export function newGame(seed: number, level: Level = "small"): State {
  const { size, mines } = LEVELS[level];
  const z = () => Array(size * size).fill(0);
  return { level, size, mines, mine: z(), open: z(), flag: z(), status: "ready", hit: -1, r: seed >>> 0, seconds: 0 };
}

export function around(i: number, size: number): number[] {
  const r = Math.floor(i / size), c = i % size;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < size && cc >= 0 && cc < size) out.push(rr * size + cc);
    }
  return out;
}

/** Mines touching cell i. */
export const count = (s: State, i: number) => around(i, s.size).reduce((a, j) => a + s.mine[j], 0);

/** Lay the mines away from the first cell and its neighbours, so the first click opens an area. */
export function layMines(s: State, first: number): State {
  const banned = new Set([first, ...around(first, s.size)]);
  const free = Array.from({ length: s.size * s.size }, (_, i) => i).filter((i) => !banned.has(i));
  let r = s.r;
  for (let i = free.length - 1; i > 0; i--) {
    const [v, r1] = step(r);
    r = r1;
    const j = Math.floor(v * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  const mine = Array(s.size * s.size).fill(0);
  for (const i of free.slice(0, s.mines)) mine[i] = 1;
  return { ...s, mine, r, status: "play" };
}

function checkWin(s: State): State {
  const left = s.open.reduce((a, v, i) => a + (v || s.mine[i] ? 0 : 1), 0);
  return left === 0 ? { ...s, status: "won", flag: s.mine.slice() } : s;
}

/** Open cells (flood-filling through zeros); a mine ends the game. */
function openCells(s: State, cells: number[]): State {
  const open = s.open.slice();
  const stack: number[] = [];
  for (const i of cells) if (!open[i] && !s.flag[i]) stack.push(i);
  let hit = -1;
  while (stack.length) {
    const i = stack.pop()!;
    if (open[i] || s.flag[i]) continue;
    open[i] = 1;
    if (s.mine[i]) { hit = i; continue; }
    if (count(s, i) === 0) for (const j of around(i, s.size)) if (!open[j]) stack.push(j);
  }
  if (hit >= 0) return { ...s, open, status: "lost", hit };
  return checkWin({ ...s, open });
}

/** Left click: reveal a hidden cell, or chord on a revealed number. */
export function reveal(s: State, i: number): State {
  if (s.status === "won" || s.status === "lost" || s.flag[i]) return s;
  if (s.status === "ready") s = layMines(s, i);
  if (s.open[i]) return chord(s, i);
  return openCells(s, [i]);
}

/** On a revealed number with as many flags around it: open the other neighbours. */
export function chord(s: State, i: number): State {
  if (s.status !== "play" || !s.open[i]) return s;
  const n = count(s, i);
  const nb = around(i, s.size);
  if (!n || nb.reduce((a, j) => a + s.flag[j], 0) !== n) return s;
  const hidden = nb.filter((j) => !s.open[j] && !s.flag[j]);
  return hidden.length ? openCells(s, hidden) : s;
}

export function toggleFlag(s: State, i: number): State {
  if ((s.status !== "play" && s.status !== "ready") || s.open[i]) return s;
  const flag = s.flag.slice();
  flag[i] ^= 1;
  return { ...s, flag };
}

export const flagsLeft = (s: State) => s.mines - s.flag.reduce((a, b) => a + b, 0);
