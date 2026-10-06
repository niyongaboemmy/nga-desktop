import { describe, expect, it } from "vitest";
import { arrow, inversions, isSolvable, isSolved, newGame, slide, solvedTiles, type State } from "./logic";

/** Breadth-first search for small boards: is the solved layout reachable? */
function reachable(tiles: number[], n: number): boolean {
  const goal = solvedTiles(n).join();
  const seen = new Set([tiles.join()]);
  let frontier = [tiles];
  while (frontier.length) {
    const next: number[][] = [];
    for (const t of frontier) {
      if (t.join() === goal) return true;
      const s: State = { n: n as 3, tiles: t, moves: 0, seconds: 0, solved: false };
      for (const d of ["up", "down", "left", "right"] as const) {
        const m = arrow(s, d).tiles;
        const k = m.join();
        if (!seen.has(k)) { seen.add(k); next.push(m); }
      }
    }
    frontier = next;
  }
  return false;
}

describe("sliding tiles", () => {
  it("counts inversions and knows the parity rule", () => {
    expect(inversions(solvedTiles(4))).toBe(0);
    expect(isSolvable(solvedTiles(4), 4)).toBe(true);
    expect(isSolvable(solvedTiles(3), 3)).toBe(true);
    // The famous 14-15 swap is impossible.
    const t = solvedTiles(4);
    [t[13], t[14]] = [t[14], t[13]];
    expect(isSolvable(t, 4)).toBe(false);
    // Moving the gap up one row keeps a 4×4 board solvable.
    const up = arrow({ n: 4, tiles: solvedTiles(4), moves: 0, seconds: 0, solved: false }, "down").tiles;
    expect(isSolvable(up, 4)).toBe(true);
  });

  it("agrees with an exhaustive search on 3×3 boards", () => {
    const base = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    const cases = [base, [2, 1, 3, 4, 5, 6, 7, 8, 0], [8, 1, 3, 4, 0, 2, 7, 6, 5], [1, 2, 3, 4, 5, 6, 8, 7, 0], [0, 1, 2, 3, 4, 5, 6, 7, 8]];
    for (const c of cases) expect(isSolvable(c, 3)).toBe(reachable(c, 3));
  });

  it("deals only solvable, unsolved boards", () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const n of [3, 4] as const) {
        const s = newGame(seed, n);
        expect(s.tiles.slice().sort((a, b) => a - b)).toEqual(Array.from({ length: n * n }, (_, i) => i));
        expect(isSolvable(s.tiles, n)).toBe(true);
        expect(isSolved(s.tiles)).toBe(false);
      }
    }
  });

  it("slides one or several tiles, counts each tile moved, wins", () => {
    const s: State = { n: 3, tiles: [1, 2, 3, 4, 5, 6, 0, 7, 8], moves: 0, seconds: 0, solved: false };
    expect(slide(s, 1)).toBe(s); // not in line with the gap
    const two = slide(s, 8);
    expect(two.tiles).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 0]);
    expect(two.moves).toBe(2);
    expect(two.solved).toBe(true);
    expect(arrow(s, "left").tiles).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 8]);
    expect(arrow(s, "right")).toBe(s);
    expect(arrow(s, "down").tiles).toEqual([1, 2, 3, 0, 5, 6, 4, 7, 8]);
  });

  it("replays identically after a JSON round-trip", () => {
    expect(newGame(77, 4)).toEqual(newGame(77, 4));
    let a = newGame(31, 4);
    let b: State = JSON.parse(JSON.stringify(a));
    for (const d of ["up", "left", "down", "right", "up", "up", "left"] as const) {
      a = arrow(a, d);
      b = arrow(b, d);
    }
    expect(b).toEqual(a);
  });
});
