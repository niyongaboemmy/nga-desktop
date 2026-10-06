// Five letters: guess a five-letter word in six tries. Pure and serialisable.
import type { Lang } from "../../i18n";
import { hash, pick, rng } from "../seed";
import { ANSWERS } from "./words";

export const LENGTH = 5;
export const TRIES = 6;

/** hit: right letter, right place · near: in the word, elsewhere · miss: not in the word (or no more of it). */
export type Mark = "hit" | "near" | "miss";
export type Mode = "daily" | "practice";

export interface State {
  lang: Lang;
  mode: Mode;
  /** The seed that chose the answer (the daily seed for a daily word). */
  seed: number;
  answer: string;
  guesses: string[];
  /** What is being typed. */
  current: string;
  won: boolean;
  over: boolean;
}

/** Lower case, accents and ligatures removed: "Été" → "ete", "œuf" → "oeuf". */
export function normalise(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae");
}

/** The answer for a seed and a language (the same seed gives each language its own word). */
export function answerFor(lang: Lang, seed: number): string {
  const list = ANSWERS[lang];
  return list[pick(rng(hash(`${seed >>> 0}:${lang}`)), list.length)];
}

export function newGame(lang: Lang, mode: Mode, seed: number): State {
  return { lang, mode, seed: seed >>> 0, answer: answerFor(lang, seed), guesses: [], current: "", won: false, over: false };
}

/**
 * Marks for one guess. Duplicates are handled like a careful teacher would: exact places first,
 * then each remaining letter of the answer can explain at most one other copy in the guess.
 */
export function marks(guess: string, answer: string): Mark[] {
  const out: Mark[] = Array(LENGTH).fill("miss");
  const left: Record<string, number> = {};
  for (let i = 0; i < LENGTH; i++) {
    if (guess[i] === answer[i]) out[i] = "hit";
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < LENGTH; i++) {
    if (out[i] === "hit") continue;
    if (left[guess[i]] > 0) {
      out[i] = "near";
      left[guess[i]]--;
    }
  }
  return out;
}

export function typeLetter(s: State, key: string): State {
  if (s.over || s.current.length >= LENGTH) return s;
  const ch = normalise(key);
  if (!/^[a-z]$/.test(ch)) return s;
  return { ...s, current: s.current + ch };
}

export function erase(s: State): State {
  if (s.over || !s.current) return s;
  return { ...s, current: s.current.slice(0, -1) };
}

/** Enter: a full row becomes a guess; anything else changes nothing. */
export function submit(s: State): State {
  if (s.over || s.current.length !== LENGTH) return s;
  const guesses = [...s.guesses, s.current];
  const won = s.current === s.answer;
  return { ...s, guesses, current: "", won, over: won || guesses.length >= TRIES };
}

const RANK: Record<Mark, number> = { miss: 0, near: 1, hit: 2 };

/** The best thing known about each letter so far (for the keyboard). */
export function letterStates(s: State): Record<string, Mark> {
  const out: Record<string, Mark> = {};
  for (const g of s.guesses) {
    marks(g, s.answer).forEach((m, i) => {
      const prev = out[g[i]];
      if (!prev || RANK[m] > RANK[prev]) out[g[i]] = m;
    });
  }
  return out;
}
