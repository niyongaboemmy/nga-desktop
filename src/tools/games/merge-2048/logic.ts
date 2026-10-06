// Merge to 2048 (mechanics after G. Cirulli's 2048, MIT; own look). Pure and serialisable.
import { step } from "../seed";

export type Dir = "up" | "down" | "left" | "right";

export interface State {
  /** 16 cells, row by row; 0 is empty. */
  cells: number[];
  score: number;
  /** The random stream (seed.ts step). */
  r: number;
  /** Reached 2048 once (the player may keep going). */
  won: boolean;
  over: boolean;
  /** Bumped on every move: lets the view animate new tiles. */
  moves: number;
}

const N = 4;

function spawn(s: State): State {
  const empty = s.cells.flatMap((v, i) => (v === 0 ? [i] : []));
  if (!empty.length) return s;
  const [a, r1] = step(s.r);
  const [b, r2] = step(r1);
  const cells = s.cells.slice();
  cells[empty[Math.floor(a * empty.length)]] = b < 0.9 ? 2 : 4;
  return { ...s, cells, r: r2 };
}

export function newGame(seed: number): State {
  return spawn(spawn({ cells: Array(N * N).fill(0), score: 0, r: seed >>> 0, won: false, over: false, moves: 0 }));
}

/** Slide one line towards index 0, merging each pair once. */
export function slideLine(line: number[]): { line: number[]; gained: number } {
  const xs = line.filter((v) => v);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] === xs[i + 1]) {
      out.push(xs[i] * 2);
      gained += xs[i] * 2;
      i++;
    } else out.push(xs[i]);
  }
  while (out.length < N) out.push(0);
  return { line: out, gained };
}

const lineIdx = (dir: Dir, k: number): number[] =>
  Array.from({ length: N }, (_, j) => {
    switch (dir) {
      case "left": return k * N + j;
      case "right": return k * N + (N - 1 - j);
      case "up": return j * N + k;
      case "down": return (N - 1 - j) * N + k;
    }
  });

export function canMove(cells: number[]): boolean {
  for (let i = 0; i < N * N; i++) {
    if (!cells[i]) return true;
    if (i % N < N - 1 && cells[i] === cells[i + 1]) return true;
    if (i < N * (N - 1) && cells[i] === cells[i + N]) return true;
  }
  return false;
}

/** A move; returns the same state when nothing moves. */
export function move(s: State, dir: Dir): State {
  if (s.over) return s;
  const cells = s.cells.slice();
  let gained = 0;
  for (let k = 0; k < N; k++) {
    const idx = lineIdx(dir, k);
    const res = slideLine(idx.map((i) => s.cells[i]));
    idx.forEach((i, j) => (cells[i] = res.line[j]));
    gained += res.gained;
  }
  if (cells.every((v, i) => v === s.cells[i])) return s;
  const next = spawn({ ...s, cells, score: s.score + gained, moves: s.moves + 1 });
  return { ...next, won: s.won || next.cells.some((v) => v >= 2048), over: !canMove(next.cells) };
}
