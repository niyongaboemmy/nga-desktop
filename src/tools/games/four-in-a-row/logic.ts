// Four in a row: drop discs into a 7×6 grid; four of yours in a line wins. Pure and serialisable.
import { step } from "../seed";

export const COLS = 7;
export const ROWS = 6;

export type Mode = "two" | "easy" | "normal";
export type Player = 1 | 2;

export interface State {
  /** 42 cells, row by row from the top; 0 empty, 1 or 2. */
  board: number[];
  turn: Player;
  mode: Mode;
  /** 0 while playing. */
  winner: 0 | Player;
  /** The winning four (cell indices), when there is one. */
  line: number[];
  draw: boolean;
  /** The last cell played (for a marker). */
  last: number | null;
  /** Random stream for the easy computer (seed.ts step). */
  r: number;
}

export function newGame(seed: number, mode: Mode = "easy"): State {
  return { board: Array(COLS * ROWS).fill(0), turn: 1, mode, winner: 0, line: [], draw: false, last: null, r: seed >>> 0 };
}

export const over = (s: State) => s.winner !== 0 || s.draw;

/** The row a disc dropped in `col` lands on, or -1 if the column is full. */
export function landing(board: number[], col: number): number {
  if (col < 0 || col >= COLS) return -1;
  for (let r = ROWS - 1; r >= 0; r--) if (!board[r * COLS + col]) return r;
  return -1;
}

export const legalCols = (board: number[]) => Array.from({ length: COLS }, (_, c) => c).filter((c) => board[c] === 0);

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

/** The four-in-a-line through `cell`, or [] if there is none. */
export function lineAt(board: number[], cell: number): number[] {
  const p = board[cell];
  if (!p) return [];
  const r0 = Math.floor(cell / COLS), c0 = cell % COLS;
  for (const [dr, dc] of DIRS) {
    const cells = [cell];
    for (const sgn of [1, -1]) {
      let r = r0 + dr * sgn, c = c0 + dc * sgn;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === p) {
        cells.push(r * COLS + c);
        r += dr * sgn;
        c += dc * sgn;
      }
    }
    if (cells.length >= 4) return cells.sort((a, b) => a - b);
  }
  return [];
}

/** Drop a disc for the player to move; the same state when the move is illegal. */
export function drop(s: State, col: number): State {
  if (over(s)) return s;
  const row = landing(s.board, col);
  if (row < 0) return s;
  const cell = row * COLS + col;
  const board = s.board.slice();
  board[cell] = s.turn;
  const line = lineAt(board, cell);
  const winner = line.length ? s.turn : 0;
  const draw = !winner && board.every((v) => v);
  return { ...s, board, last: cell, line, winner, draw, turn: s.turn === 1 ? 2 : 1 };
}

/** Is it the computer's turn? (The computer always plays 2.) */
export const computerToMove = (s: State) => s.mode !== "two" && s.turn === 2 && !over(s);

const ORDER = [3, 2, 4, 1, 5, 0, 6];

function winsWith(board: number[], col: number, p: number): boolean {
  const row = landing(board, col);
  if (row < 0) return false;
  const cell = row * COLS + col;
  board[cell] = p;
  const w = lineAt(board, cell).length > 0;
  board[cell] = 0;
  return w;
}

/** Easy: take a win, else block a loss, else a random legal column. Returns [col, next random state]. */
export function easyMove(s: State): [number, number] {
  const b = s.board.slice();
  const me = s.turn, you = me === 1 ? 2 : 1;
  const cols = legalCols(b);
  for (const c of cols) if (winsWith(b, c, me)) return [c, s.r];
  for (const c of cols) if (winsWith(b, c, you)) return [c, s.r];
  const [x, r] = step(s.r);
  return [cols[Math.floor(x * cols.length)], r];
}

// A static score from `p`'s point of view: open windows of 2 and 3, and the centre column.
function evaluate(b: number[], p: number): number {
  const o = p === 1 ? 2 : 1;
  let score = 0;
  for (let r = 0; r < ROWS; r++) if (b[r * COLS + 3] === p) score += 3; else if (b[r * COLS + 3] === o) score -= 3;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const [dr, dc] of DIRS) {
        const er = r + dr * 3, ec = c + dc * 3;
        if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
        let mine = 0, theirs = 0;
        for (let k = 0; k < 4; k++) {
          const v = b[(r + dr * k) * COLS + c + dc * k];
          if (v === p) mine++;
          else if (v === o) theirs++;
        }
        if (mine && theirs) continue;
        if (mine === 3) score += 5;
        else if (mine === 2) score += 2;
        else if (theirs === 3) score -= 4;
        else if (theirs === 2) score -= 1;
      }
  return score;
}

const WIN = 1_000_000;

function negamax(b: number[], p: number, depth: number, alpha: number, beta: number, filled: number): number {
  if (filled === COLS * ROWS) return 0;
  if (depth === 0) return evaluate(b, p);
  const o = p === 1 ? 2 : 1;
  // A win now ends the search at once (scored higher the sooner it comes).
  for (const c of ORDER) if (winsWith(b, c, p)) return WIN + depth;
  let best = -Infinity;
  for (const c of ORDER) {
    const row = landing(b, c);
    if (row < 0) continue;
    const cell = row * COLS + c;
    b[cell] = p;
    const v = -negamax(b, o, depth - 1, -beta, -alpha, filled + 1);
    b[cell] = 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/** Normal: negamax with alpha-beta, centre columns first. */
export function bestMove(s: State, depth = 5): number {
  const b = s.board.slice();
  const p = s.turn, o = p === 1 ? 2 : 1;
  const cols = ORDER.filter((c) => landing(b, c) >= 0);
  for (const c of cols) if (winsWith(b, c, p)) return c;
  const filled = b.filter((v) => v).length;
  let best = cols[0], bestV = -Infinity;
  for (const c of cols) {
    const cell = landing(b, c) * COLS + c;
    b[cell] = p;
    const v = -negamax(b, o, depth - 1, -Infinity, -bestV, filled + 1);
    b[cell] = 0;
    if (v > bestV) {
      bestV = v;
      best = c;
    }
  }
  return best;
}

/** The computer's move (mode easy or normal), applied. */
export function computerMove(s: State): State {
  if (!computerToMove(s)) return s;
  if (s.mode === "easy") {
    const [c, r] = easyMove(s);
    return drop({ ...s, r }, c);
  }
  return drop(s, bestMove(s));
}
