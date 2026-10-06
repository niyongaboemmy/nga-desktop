// Pairs: turn over two cards; a matching pair stays face up. Pure and serialisable.
import { rng, shuffle } from "../seed";
import { SETS, type SetId } from "./sets";

export type Size = 12 | 16 | 20;

export interface Card {
  /** Index of the pair in its set. */
  pair: number;
  side: "a" | "b";
}

export interface State {
  set: SetId;
  size: Size;
  players: 1 | 2;
  cards: Card[];
  matched: boolean[];
  /** Face-up cards that aren't matched yet (0, 1 or 2). */
  open: number[];
  moves: number;
  turn: 0 | 1;
  scores: [number, number];
  /** Seconds played (only while not paused). */
  elapsed: number;
  done: boolean;
}

export function newGame(seed: number, set: SetId = "elements", size: Size = 16, players: 1 | 2 = 1): State {
  const r = rng(seed);
  const items = SETS[set];
  const pairs = shuffle(items.map((_, i) => i), r).slice(0, Math.min(size / 2, items.length));
  const cards = shuffle(pairs.flatMap((pair): Card[] => [{ pair, side: "a" }, { pair, side: "b" }]), r);
  return { set, size, players, cards, matched: cards.map(() => false), open: [], moves: 0, turn: 0, scores: [0, 0], elapsed: 0, done: false };
}

/** Is a second card waiting to be turned back (no match)? */
export const waiting = (s: State) => s.open.length === 2;

/** Turn a card over. Matching pairs stay; a mismatch waits for hide(). */
export function flip(s: State, i: number): State {
  if (s.done || waiting(s) || i < 0 || i >= s.cards.length || s.matched[i] || s.open.includes(i)) return s;
  if (s.open.length === 0) return { ...s, open: [i] };
  const j = s.open[0];
  const moves = s.moves + 1;
  if (s.cards[j].pair !== s.cards[i].pair) return { ...s, open: [j, i], moves };
  const matched = s.matched.slice();
  matched[i] = matched[j] = true;
  const scores: [number, number] = [...s.scores];
  scores[s.turn]++;
  // A match gives the same player another turn.
  return { ...s, matched, open: [], moves, scores, done: matched.every(Boolean) };
}

/** Turn a mismatched pair back; in a 2-player game the other player plays next. */
export function hide(s: State): State {
  if (!waiting(s)) return s;
  return { ...s, open: [], turn: s.players === 2 ? ((1 - s.turn) as 0 | 1) : s.turn };
}

export const faceUp = (s: State, i: number) => s.matched[i] || s.open.includes(i);
