// Code breaker: guess a hidden code of coloured pegs (a classic deduction game; own look).
// Pure and serialisable.
import { pick, rng } from "../seed";

export type Level = "classic" | "hard";

export const LEVELS: Record<Level, { pegs: number; colors: number }> = {
  classic: { pegs: 4, colors: 6 },
  hard: { pegs: 5, colors: 7 },
};

export const TRIES = 10;

export interface Guess {
  code: number[];
  /** Right colour in the right place (filled dot). */
  exact: number;
  /** Right colour, wrong place (ring). */
  near: number;
}

export interface State {
  level: Level;
  pegs: number;
  colors: number;
  /** Colours 0..colors-1; repeats allowed. */
  secret: number[];
  guesses: Guess[];
  /** The row being entered (may be shorter than `pegs`). */
  current: number[];
  won: boolean;
  over: boolean;
  /** The seed this game was made from (a new game derives its seed from it). */
  seed: number;
}

export function newGame(seed: number, level: Level = "classic"): State {
  const { pegs, colors } = LEVELS[level] ?? LEVELS.classic;
  const r = rng(seed);
  const secret = Array.from({ length: pegs }, () => pick(r, colors));
  return { level, pegs, colors, secret, guesses: [], current: [], won: false, over: false, seed: seed >>> 0 };
}

/** Exact and colour-only matches, counting each peg once (multiset scoring). */
export function score(secret: number[], guess: number[]): { exact: number; near: number } {
  let exact = 0;
  const a = new Map<number, number>();
  const b = new Map<number, number>();
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) exact++;
    else {
      a.set(secret[i], (a.get(secret[i]) ?? 0) + 1);
      b.set(guess[i], (b.get(guess[i]) ?? 0) + 1);
    }
  }
  let near = 0;
  for (const [c, n] of b) near += Math.min(n, a.get(c) ?? 0);
  return { exact, near };
}

export function addPeg(s: State, color: number): State {
  if (s.over || s.current.length >= s.pegs || color < 0 || color >= s.colors) return s;
  return { ...s, current: [...s.current, color] };
}

export function removePeg(s: State): State {
  if (s.over || !s.current.length) return s;
  return { ...s, current: s.current.slice(0, -1) };
}

/** Submit the current row; returns the same state if it is not complete. */
export function submit(s: State): State {
  if (s.over || s.current.length !== s.pegs) return s;
  const fb = score(s.secret, s.current);
  const guesses = [...s.guesses, { code: s.current, ...fb }];
  const won = fb.exact === s.pegs;
  return { ...s, guesses, current: [], won, over: won || guesses.length >= TRIES };
}
