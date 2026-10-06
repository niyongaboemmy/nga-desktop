import { describe, expect, it } from "vitest";
import { clear, clue, cluesOf, colDone, CROSSED, FILLED, lineSolve, mark, newGame, rowDone, solveLine, type State } from "./logic";

describe("picture logic", () => {
  it("computes clues", () => {
    expect(clue([1, 1, 0, 1, 0, 0, 1, 1, 1])).toEqual([2, 1, 3]);
    expect(clue([0, 0, 0])).toEqual([]);
    expect(clue([1, 1, 1])).toEqual([3]);
  });

  it("the line solver forces overlaps and gaps", () => {
    const u = (n: number) => Array(n).fill(-1);
    // 4 in 5: the middle 3 are certain.
    expect(solveLine([4], u(5))).toEqual([-1, 1, 1, 1, -1]);
    // 2,2 in 5: fully determined.
    expect(solveLine([2, 2], u(5))).toEqual([1, 1, 0, 1, 1]);
    // An empty clue empties the line.
    expect(solveLine([], u(4))).toEqual([0, 0, 0, 0]);
    // Known cells narrow it down: 1 filled at index 0 with clue [2] → [1,1,0,0].
    expect(solveLine([2], [1, -1, -1, -1])).toEqual([1, 1, 0, 0]);
    // Nothing forced for 1 in 3.
    expect(solveLine([1], u(3))).toEqual([-1, -1, -1]);
    // Contradiction.
    expect(solveLine([3], [1, 0, -1, -1])).toBeNull();
  });

  it("the grid solver stops when it would have to guess", () => {
    // A 2×2 diagonal has two answers: nothing can be forced.
    const amb = cluesOf([1, 0, 0, 1], 2);
    expect(lineSolve(amb.rows, amb.cols)).toEqual([-1, -1, -1, -1]);
    const plus = [0, 1, 0, 1, 1, 1, 0, 1, 0];
    const c = cluesOf(plus, 3);
    expect(lineSolve(c.rows, c.cols)).toEqual(plus);
  });

  it("deals pictures the line solver finishes, about 55% filled", () => {
    for (const n of [5, 10, 15] as const) {
      let filled = 0;
      for (let seed = 1; seed <= 15; seed++) {
        const s = newGame(seed, n);
        expect(lineSolve(s.rows, s.cols)).toEqual(s.picture);
        filled += s.picture.reduce((a, b) => a + b, 0);
      }
      const ratio = filled / (15 * n * n);
      expect(ratio).toBeGreaterThan(0.4);
      expect(ratio).toBeLessThan(0.75);
    }
    expect(newGame(123, 10, true)).toEqual(newGame(123, 10, true));
  });

  it("wins when the filled cells match; crosses don't matter; clues dim when met", () => {
    let s = newGame(8, 5);
    s = mark(s, s.picture.indexOf(0), CROSSED);
    s.picture.forEach((v, i) => { if (v) s = mark(s, i, FILLED); });
    expect(s.solved).toBe(true);
    for (let k = 0; k < 5; k++) { expect(rowDone(s, k)).toBe(true); expect(colDone(s, k)).toBe(true); }
    expect(mark(s, 0, CROSSED)).toBe(s);
    const c = clear(s);
    expect(c.solved).toBe(false);
    expect(c.marks.every((m) => m === 0)).toBe(true);
    // An extra filled cell is not a win.
    let x = newGame(8, 5);
    x = mark(x, x.picture.indexOf(0), FILLED);
    x.picture.forEach((v, i) => { if (v) x = mark(x, i, FILLED); });
    expect(x.solved).toBe(false);
  });

  it("replays identically after a JSON round-trip", () => {
    let a = mark(newGame(44, 10), 0, FILLED);
    let b: State = JSON.parse(JSON.stringify(a));
    for (const i of [3, 15, 27, 99, 50]) {
      a = mark(a, i, i % 2 ? FILLED : CROSSED);
      b = mark(b, i, i % 2 ? FILLED : CROSSED);
    }
    expect(b).toEqual(a);
  });
});
