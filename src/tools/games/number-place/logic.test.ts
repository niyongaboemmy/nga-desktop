import { describe, expect, it } from "vitest";
import {
  conflicts, countSolutions, erase, generate, GIVENS, hint, isValidGrid, newGame, setValue, toggleNote, type State,
} from "./logic";

describe("number place", () => {
  it.each(Object.entries(GIVENS))("%s puzzles have exactly one solution, which follows the rules", (level, target) => {
    for (let seed = 1; seed <= 20; seed++) {
      const { puzzle, solution } = generate(seed * 7919 + target, level as keyof typeof GIVENS);
      expect(isValidGrid(solution)).toBe(true);
      expect(puzzle.filter(Boolean).length).toBe(target);
      puzzle.forEach((v, i) => v && expect(v).toBe(solution[i]));
      expect(countSolutions(puzzle, 2)).toBe(1);
      const out = Array(81).fill(0);
      countSolutions(puzzle, 1, undefined, out);
      expect(out).toEqual(solution);
    }
  });

  it("counts solutions and stops at the limit", () => {
    expect(countSolutions(Array(81).fill(0), 2)).toBe(2);
    const bad = Array(81).fill(0);
    bad[0] = bad[1] = 5;
    expect(countSolutions(bad, 2)).toBe(0);
  });

  it("the daily seed always gives the same puzzle", () => {
    expect(newGame(20261006, "daily")).toEqual(newGame(20261006, "daily"));
    expect(newGame(20261006, "daily").puzzle).not.toEqual(newGame(20261007, "daily").puzzle);
  });

  it("places digits, notes, erases, highlights conflicts and wins", () => {
    let s = newGame(3, "easy");
    const empty = s.puzzle.indexOf(0);
    const given = s.puzzle.findIndex((v) => v);
    expect(setValue(s, given, 1)).toBe(s);
    s = toggleNote(toggleNote(s, empty, 4), empty, 7);
    expect(s.notes[empty]).toBe((1 << 4) | (1 << 7));
    s = setValue(s, empty, s.solution[empty]);
    expect(s.notes[empty]).toBe(0);
    s = erase(s, empty);
    expect(s.values[empty]).toBe(0);
    // A digit already in the row is a conflict.
    const r0 = Math.floor(empty / 9) * 9;
    const rowGiven = [...Array(9).keys()].map((k) => r0 + k).find((k) => s.puzzle[k])!;
    const c = setValue(s, empty, s.puzzle[rowGiven]);
    expect(conflicts(c.values)[empty]).toBe(1);
    expect(conflicts(c.values)[rowGiven]).toBe(1);
    // Fill everything correctly: solved.
    let w = s;
    s.puzzle.forEach((v, i) => { if (!v) w = setValue(w, i, s.solution[i]); });
    expect(w.solved).toBe(true);
    expect(setValue(w, empty, 1)).toBe(w);
  });

  it("gives 3 hints that fill correct cells", () => {
    let s = newGame(11, "hard");
    const wrongAt = s.puzzle.indexOf(0);
    s = setValue(s, wrongAt, (s.solution[wrongAt] % 9) + 1);
    s = hint(s, wrongAt);
    expect(s.values[wrongAt]).toBe(s.solution[wrongAt]);
    s = hint(hint(s, wrongAt), wrongAt);
    expect(s.hintsLeft).toBe(0);
    expect(s.hinted.length).toBe(3);
    s.hinted.forEach((i) => expect(s.values[i]).toBe(s.solution[i]));
    expect(hint(s, 0)).toBe(s);
  });

  it("replays identically after a JSON round-trip", () => {
    let a = newGame(5, "medium");
    const empties = a.puzzle.flatMap((v, i) => (v ? [] : [i]));
    a = setValue(a, empties[0], 3);
    let b: State = JSON.parse(JSON.stringify(a));
    for (const i of empties.slice(1, 8)) {
      a = hint(toggleNote(a, i, 2), i);
      b = hint(toggleNote(b, i, 2), i);
    }
    expect(b).toEqual(a);
  });
});
