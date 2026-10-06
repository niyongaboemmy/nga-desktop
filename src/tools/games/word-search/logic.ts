// Word search: subject words hidden in a letter grid in 8 directions. Pure and serialisable.
import type { Lang } from "../../i18n";
import { step } from "../seed";
import { PACKS } from "./packs";

export type Size = 10 | 12;
/** Words hidden per grid size. */
export const WORDS_PER: Record<Size, number> = { 10: 8, 12: 12 };

/** The 8 directions: [row step, column step]. */
export const DIRS: [number, number][] = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];

export interface Placed {
  /** As shown in the list (accents kept). */
  word: string;
  /** As hidden in the grid (plain capitals). */
  key: string;
  r: number;
  c: number;
  dr: number;
  dc: number;
}

/** A found word: the cells the player marked, first and last. */
export type Found = [number, number, number, number] | null;

export interface State {
  lang: Lang;
  pack: string;
  size: Size;
  seed: number;
  /** size × size capitals, row by row. */
  grid: string;
  words: Placed[];
  found: Found[];
  over: boolean;
}

/** "Molécule" → "MOLECULE", "w'umuntu" → "WUMUNTU". */
export function gridKey(word: string): string {
  return word.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/Œ/g, "OE").replace(/[^A-Z]/g, "");
}

class Rand {
  constructor(public r: number) {}
  next(): number {
    const [v, r] = step(this.r);
    this.r = r;
    return v;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
}

function tryPlace(cells: (string | null)[], size: number, key: string, g: Rand): Placed | null {
  for (let t = 0; t < 400; t++) {
    const [dr, dc] = DIRS[g.int(8)];
    const r = g.int(size), c = g.int(size);
    const er = r + dr * (key.length - 1), ec = c + dc * (key.length - 1);
    if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
    let ok = true;
    for (let i = 0; i < key.length && ok; i++) {
      const v = cells[(r + dr * i) * size + (c + dc * i)];
      if (v !== null && v !== key[i]) ok = false;
    }
    if (!ok) continue;
    for (let i = 0; i < key.length; i++) cells[(r + dr * i) * size + (c + dc * i)] = key[i];
    return { word: "", key, r, c, dr, dc };
  }
  return null;
}

/** Spell what lies on the grid from one cell to another (null if not a straight line). */
export function spell(grid: string, size: number, r1: number, c1: number, r2: number, c2: number): string | null {
  const dr = Math.sign(r2 - r1), dc = Math.sign(c2 - c1);
  const n = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1));
  if (r1 !== r2 && c1 !== c2 && Math.abs(r2 - r1) !== Math.abs(c2 - c1)) return null;
  let out = "";
  for (let i = 0; i <= n; i++) out += grid[(r1 + dr * i) * size + (c1 + dc * i)];
  return out;
}

export function newGame(lang: Lang, packId: string, size: Size, seed: number): State {
  const pack = PACKS.find((p) => p.id === packId && p.words[lang]?.length) ?? PACKS.find((p) => p.words[lang]?.length)!;
  const all = pack.words[lang]!;
  const g = new Rand(seed >>> 0);
  // Choose the words with the seed, then place the longest first.
  const chosen = all.slice();
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = g.int(i + 1);
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  const want = chosen.slice(0, Math.min(WORDS_PER[size], chosen.length)).filter((x) => gridKey(x).length <= size);
  want.sort((a, b) => gridKey(b).length - gridKey(a).length);

  let cells: (string | null)[] = [];
  let placed: Placed[] = [];
  for (let attempt = 0; attempt < 200; attempt++) {
    cells = Array(size * size).fill(null);
    placed = [];
    for (const word of want) {
      const p = tryPlace(cells, size, gridKey(word), g);
      if (!p) break;
      placed.push({ ...p, word });
    }
    if (placed.length === want.length) break;
  }
  // Fill the rest with letters drawn from the pack itself (so the filler looks like the words).
  const pool = all.map(gridKey).join("");
  const grid = cells.map((v) => v ?? pool[g.int(pool.length)]).join("");
  placed.sort((a, b) => a.word.localeCompare(b.word, lang));
  return { lang, pack: pack.id, size, seed: seed >>> 0, grid, words: placed, found: placed.map(() => null), over: false };
}

/**
 * The player marked a line from (r1, c1) to (r2, c2). If it spells a word still to find
 * (either way round), the word is found. Returns the same state when nothing matches.
 */
export function mark(s: State, r1: number, c1: number, r2: number, c2: number): State {
  if (s.over) return s;
  const text = spell(s.grid, s.size, r1, c1, r2, c2);
  if (!text || text.length < 2) return s;
  const back = [...text].reverse().join("");
  const i = s.words.findIndex((w, k) => !s.found[k] && (w.key === text || w.key === back));
  if (i < 0) return s;
  const found = s.found.slice();
  found[i] = [r1, c1, r2, c2];
  return { ...s, found, over: found.every(Boolean) };
}

/** Cells of a line, as indexes (empty if not straight). */
export function lineCells(size: number, r1: number, c1: number, r2: number, c2: number): number[] {
  if (r1 !== r2 && c1 !== c2 && Math.abs(r2 - r1) !== Math.abs(c2 - c1)) return [];
  const dr = Math.sign(r2 - r1), dc = Math.sign(c2 - c1);
  const n = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1));
  return Array.from({ length: n + 1 }, (_, i) => (r1 + dr * i) * size + (c1 + dc * i));
}
