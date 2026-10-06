import { describe, expect, it } from "vitest";
import { around, chord, count, flagsLeft, LEVELS, newGame, reveal, toggleFlag, type State } from "./logic";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** A hand-made board: mines at the given cells, already in play. */
function board(size: number, mines: number[]): State {
  const s = newGame(1, "small");
  const z = () => Array(size * size).fill(0);
  const mine = z();
  for (const m of mines) mine[m] = 1;
  return { ...s, size, mines: mines.length, mine, open: z(), flag: z(), status: "play" };
}

describe("mines", () => {
  it("makes the first click safe and opens an area", () => {
    for (const level of ["small", "medium", "large"] as const) {
      for (let seed = 1; seed <= 25; seed++) {
        const first = (seed * 7) % (LEVELS[level].size ** 2);
        const s = reveal(newGame(seed, level), first);
        expect(sum(s.mine)).toBe(LEVELS[level].mines);
        expect(s.status).not.toBe("lost");
        expect(s.mine[first]).toBe(0);
        for (const j of around(first, s.size)) expect(s.mine[j]).toBe(0);
        expect(count(s, first)).toBe(0);
        expect(sum(s.open)).toBeGreaterThan(1);
      }
    }
  });

  it("flood-fills zeros and stops at numbers", () => {
    // 3×3 with one mine in the corner: clicking the far corner opens all 8 safe cells.
    const s = reveal(board(3, [0]), 8);
    expect(s.open).toEqual([0, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(s.status).toBe("won");
    expect(s.flag[0]).toBe(1);
  });

  it("loses on a mine and remembers which one", () => {
    const s = reveal(board(3, [4]), 4);
    expect(s.status).toBe("lost");
    expect(s.hit).toBe(4);
    expect(reveal(s, 0)).toBe(s);
  });

  it("flags and chords", () => {
    let s = board(4, [0, 15]);
    s = reveal(s, 1);
    expect(s.open[1]).toBe(1);
    expect(count(s, 1)).toBe(1);
    expect(chord(s, 1)).toBe(s); // no flag yet
    s = toggleFlag(s, 0);
    expect(flagsLeft(s)).toBe(1);
    expect(reveal(s, 0)).toBe(s); // flagged cells ignore clicks
    const c = reveal(s, 1); // chord through the left click
    expect(c.open[4]).toBe(1);
    expect(c.open[5]).toBe(1);
    expect(c.status).not.toBe("lost");
    // A wrong flag makes the chord open a mine.
    let w = reveal(board(4, [0, 15]), 1);
    w = toggleFlag(w, 5);
    expect(chord(w, 1).status).toBe("lost");
    expect(toggleFlag(toggleFlag(s, 3), 3).flag).toEqual(s.flag);
  });

  it("replays identically after a JSON round-trip", () => {
    let a = reveal(newGame(99, "medium"), 70);
    let b: State = JSON.parse(JSON.stringify(a));
    const fresh = reveal(newGame(99, "medium"), 70);
    expect(fresh).toEqual(a);
    for (const i of [0, 11, 50, 143, 77]) {
      a = toggleFlag(reveal(a, i), (i + 3) % 144);
      b = toggleFlag(reveal(b, i), (i + 3) % 144);
    }
    expect(b).toEqual(a);
  });
});
