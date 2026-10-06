import { describe, expect, it } from "vitest";
import { canMove, move, newGame, slideLine, type State } from "./logic";

describe("merge to 2048", () => {
  it("merges each pair once, towards the wall", () => {
    expect(slideLine([2, 2, 2, 2])).toEqual({ line: [4, 4, 0, 0], gained: 8 });
    expect(slideLine([0, 2, 0, 2])).toEqual({ line: [4, 0, 0, 0], gained: 4 });
    expect(slideLine([4, 4, 8, 0])).toEqual({ line: [8, 8, 0, 0], gained: 8 });
    expect(slideLine([2, 4, 8, 16])).toEqual({ line: [2, 4, 8, 16], gained: 0 });
  });

  it("starts with two tiles and replays exactly from a saved state", () => {
    const s = newGame(123);
    expect(s.cells.filter((v) => v).length).toBe(2);
    let a: State = s;
    for (const d of ["left", "up", "right", "down", "left", "up"] as const) a = move(a, d);
    // Save and restore (JSON), then play on: identical futures.
    let b: State = JSON.parse(JSON.stringify(a));
    for (const d of ["down", "left", "up", "right"] as const) {
      a = move(a, d);
      b = move(b, d);
    }
    expect(b).toEqual(a);
  });

  it("does nothing on a move that changes nothing", () => {
    const s: State = { cells: [2, 4, 8, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], score: 0, r: 1, won: false, over: false, moves: 0 };
    expect(move(s, "left")).toBe(s);
    expect(move(s, "up")).toBe(s);
    expect(move(s, "down").moves).toBe(1);
  });

  it("notices a win and the end", () => {
    const s: State = { cells: [1024, 1024, 0, 0, ...Array(12).fill(0)], score: 0, r: 1, won: false, over: false, moves: 0 };
    expect(move(s, "left").won).toBe(true);
    expect(canMove([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2])).toBe(false);
    expect(canMove([2, 2, 4, 8, 4, 8, 2, 4, 2, 4, 8, 2, 4, 2, 4, 8])).toBe(true);
  });
});
