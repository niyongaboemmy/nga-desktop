import { describe, expect, it } from "vitest";
import { hint, N, neighbours, newGame, press, restart, solve, toggle, type State } from "./logic";

const applyAll = (cells: number[], presses: number[]) =>
  presses.reduce((c, p, i) => (p ? toggle(c, i) : c), cells);

describe("lights out", () => {
  it("toggles a cell and its 4 neighbours", () => {
    expect(neighbours(0).sort((a, b) => a - b)).toEqual([0, 1, 5]);
    expect(neighbours(12).sort((a, b) => a - b)).toEqual([7, 11, 12, 13, 17]);
    const c = toggle(Array(25).fill(0), 12);
    expect(c.reduce((a, b) => a + b, 0)).toBe(5);
    expect(toggle(c, 12).every((v) => v === 0)).toBe(true);
  });

  it("generates solvable puzzles; the solver switches every light off", () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const level of ["easy", "medium", "hard"] as const) {
        const s = newGame(seed, level);
        expect(s.cells.some((v) => v)).toBe(true);
        const x = solve(s.cells)!;
        expect(x).not.toBeNull();
        expect(applyAll(s.cells, x).every((v) => v === 0)).toBe(true);
      }
    }
  });

  it("finds the fewest presses and refuses an unsolvable board", () => {
    const one = toggle(Array(25).fill(0), 7);
    expect(solve(one)).toEqual(Array.from({ length: 25 }, (_, i) => (i === 7 ? 1 : 0)));
    // A single lit corner is not solvable on 5×5.
    const corner = Array(25).fill(0);
    corner[0] = 1;
    expect(solve(corner)).toBeNull();
    expect(hint(one)).toBe(7);
    expect(hint(Array(25).fill(0))).toBeNull();
  });

  it("wins by following hints, counts moves, restarts", () => {
    let s = newGame(42, "medium");
    let guard = 0;
    while (!s.solved && guard++ < 30) s = press(s, hint(s.cells)!);
    expect(s.solved).toBe(true);
    expect(s.moves).toBeGreaterThan(0);
    expect(press(s, 3)).toBe(s);
    const r = restart(s);
    expect(r.cells).toEqual(r.start);
    expect(r.moves).toBe(0);
  });

  it("is the same game from the same seed and replays after a JSON round-trip", () => {
    expect(newGame(9, "hard")).toEqual(newGame(9, "hard"));
    let a: State = press(newGame(5, "hard"), 6);
    let b: State = JSON.parse(JSON.stringify(a));
    for (const i of [1, 2, 3, 18, N * N - 1]) {
      a = press(a, i);
      b = press(b, i);
    }
    expect(b).toEqual(a);
  });
});
