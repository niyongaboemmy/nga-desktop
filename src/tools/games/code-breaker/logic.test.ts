import { describe, expect, it } from "vitest";
import { addPeg, newGame, removePeg, score, submit, TRIES, type State } from "./logic";

const enter = (s: State, code: number[]) => submit(code.reduce(addPeg, s));

describe("code breaker", () => {
  it("scores exact and colour-only pegs", () => {
    expect(score([0, 1, 2, 3], [0, 1, 2, 3])).toEqual({ exact: 4, near: 0 });
    expect(score([0, 1, 2, 3], [3, 2, 1, 0])).toEqual({ exact: 0, near: 4 });
    expect(score([0, 1, 2, 3], [4, 4, 5, 5])).toEqual({ exact: 0, near: 0 });
    expect(score([0, 1, 2, 3], [0, 2, 4, 5])).toEqual({ exact: 1, near: 1 });
  });

  it("counts duplicates once (multiset scoring)", () => {
    // Secret has one 0: a guess of four 0s gets one exact, no rings.
    expect(score([0, 1, 2, 3], [0, 0, 0, 0])).toEqual({ exact: 1, near: 0 });
    // Secret has two 1s; guess has three 1s, one in place.
    expect(score([1, 1, 2, 3], [1, 3, 1, 1])).toEqual({ exact: 1, near: 2 });
    // Guess repeats a colour the secret has once, neither in place.
    expect(score([0, 1, 2, 3], [1, 0, 0, 5])).toEqual({ exact: 0, near: 2 });
    expect(score([2, 2, 1, 1], [1, 1, 2, 2])).toEqual({ exact: 0, near: 4 });
    expect(score([2, 2, 1, 1], [2, 1, 2, 5])).toEqual({ exact: 1, near: 2 });
    expect(score([0, 0, 0, 1, 1], [1, 1, 1, 0, 0])).toEqual({ exact: 0, near: 4 });
  });

  it("makes the secret from the seed, per level", () => {
    const a = newGame(42);
    expect(a.secret).toHaveLength(4);
    expect(a.secret.every((c) => c >= 0 && c < 6)).toBe(true);
    expect(newGame(42).secret).toEqual(a.secret);
    const h = newGame(42, "hard");
    expect(h.secret).toHaveLength(5);
    expect(h.secret.every((c) => c >= 0 && c < 7)).toBe(true);
  });

  it("enters, removes and submits pegs", () => {
    let s = newGame(1);
    s = addPeg(addPeg(s, 2), 3);
    expect(s.current).toEqual([2, 3]);
    expect(removePeg(s).current).toEqual([2]);
    expect(submit(s)).toBe(s); // incomplete row
    expect(addPeg(s, 9)).toBe(s); // unknown colour
    s = addPeg(addPeg(s, 0), 0);
    expect(addPeg(s, 1)).toBe(s); // row full
    s = submit(s);
    expect(s.guesses).toHaveLength(1);
    expect(s.current).toEqual([]);
  });

  it("wins on an exact guess and ends after the last try", () => {
    const s = newGame(7);
    const won = enter(s, s.secret);
    expect(won.won && won.over).toBe(true);
    expect(addPeg(won, 0)).toBe(won);
    const wrong = s.secret.map((c) => (c + 1) % 6);
    let l = s;
    for (let i = 0; i < TRIES; i++) l = enter(l, wrong);
    expect(l.over).toBe(true);
    expect(l.won).toBe(false);
    expect(l.guesses).toHaveLength(TRIES);
  });

  it("survives a save and restore", () => {
    let s = enter(newGame(99), [0, 1, 2, 3]);
    s = addPeg(s, 4);
    const b: State = JSON.parse(JSON.stringify(s));
    expect(b).toEqual(s);
    expect(enter(b, [5, 5, 5])).toEqual(enter(s, [5, 5, 5]));
  });
});
