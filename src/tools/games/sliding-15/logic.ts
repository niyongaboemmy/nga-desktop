// Sliding tiles (the classic 15 puzzle, 3×3 or 4×4). Pure and serialisable.
import { step } from "../seed";

export type Size = 3 | 4;
export type Dir = "up" | "down" | "left" | "right";

export interface State {
  n: Size;
  /** n*n tiles, row by row; 0 is the gap. Solved: 1, 2, …, n*n-1, 0. */
  tiles: number[];
  moves: number;
  seconds: number;
  solved: boolean;
}

export const solvedTiles = (n: number) => Array.from({ length: n * n }, (_, i) => (i + 1) % (n * n));
export const isSolved = (tiles: number[]) => tiles.every((v, i) => v === (i + 1) % tiles.length);

export function inversions(tiles: number[]): number {
  const xs = tiles.filter((v) => v);
  let inv = 0;
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (xs[i] > xs[j]) inv++;
  return inv;
}

/**
 * Can this layout reach the solved one? Odd width: inversions even. Even width:
 * inversions + the gap's row counted from the bottom (1-based) is odd.
 */
export function isSolvable(tiles: number[], n: number): boolean {
  const inv = inversions(tiles);
  if (n % 2) return inv % 2 === 0;
  const rowFromBottom = n - Math.floor(tiles.indexOf(0) / n);
  return (inv + rowFromBottom) % 2 === 1;
}

/** A random permutation, made solvable by swapping two tiles if its parity is wrong. */
export function newGame(seed: number, n: Size = 4): State {
  let r = seed >>> 0;
  for (;;) {
    const tiles = solvedTiles(n);
    for (let i = tiles.length - 1; i > 0; i--) {
      const [v, r1] = step(r);
      r = r1;
      const j = Math.floor(v * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    if (!isSolvable(tiles, n)) {
      // Swapping two numbered tiles flips the parity.
      const a = tiles.findIndex((v) => v);
      const b = tiles.findIndex((v, i) => v && i !== a);
      [tiles[a], tiles[b]] = [tiles[b], tiles[a]];
    }
    if (!isSolved(tiles)) return { n, tiles, moves: 0, seconds: 0, solved: false };
  }
}

/** Click tile i: slides it (and any tiles between it and the gap) when it shares the gap's row or column. */
export function slide(s: State, i: number): State {
  if (s.solved) return s;
  const { n } = s;
  const g = s.tiles.indexOf(0);
  if (i === g || i < 0 || i >= n * n) return s;
  const gr = Math.floor(g / n), gc = g % n, ir = Math.floor(i / n), ic = i % n;
  let stride: number;
  if (gr === ir) stride = ic > gc ? 1 : -1;
  else if (gc === ic) stride = ir > gr ? n : -n;
  else return s;
  const tiles = s.tiles.slice();
  let moved = 0;
  for (let p = g; p !== i; p += stride) {
    tiles[p] = tiles[p + stride];
    moved++;
  }
  tiles[i] = 0;
  return { ...s, tiles, moves: s.moves + moved, solved: isSolved(tiles) };
}

/** An arrow key moves the tile next to the gap into it (ArrowUp moves the tile below the gap up). */
export function arrow(s: State, d: Dir): State {
  const { n } = s;
  const g = s.tiles.indexOf(0);
  const r = Math.floor(g / n), c = g % n;
  const from =
    d === "up" ? (r < n - 1 ? g + n : -1) :
    d === "down" ? (r > 0 ? g - n : -1) :
    d === "left" ? (c < n - 1 ? g + 1 : -1) :
    c > 0 ? g - 1 : -1;
  return from < 0 ? s : slide(s, from);
}
