import { describe, expect, it } from "vitest";
import { begin, newGame, press, replay, shown, type State } from "./logic";

const playBack = (s: State): State => {
  let x = shown(s);
  for (const p of x.seq) x = press(x, p);
  return x;
};

describe("echo", () => {
  it("starts with one pad, ready, from the seed", () => {
    const s = newGame(7);
    expect(s.seq).toHaveLength(1);
    expect(s.phase).toBe("ready");
    expect(newGame(7)).toEqual(s);
    expect(s.seq[0]).toBeGreaterThanOrEqual(0);
    expect(s.seq[0]).toBeLessThan(4);
  });

  it("grows by one after each full repeat, keeping the old sequence", () => {
    let s = begin(newGame(42));
    expect(s.phase).toBe("show");
    const first = s.seq.slice();
    s = playBack(s);
    expect(s.phase).toBe("show");
    expect(s.score).toBe(1);
    expect(s.seq).toHaveLength(2);
    expect(s.seq.slice(0, 1)).toEqual(first);
    s = playBack(s);
    s = playBack(s);
    expect(s.score).toBe(3);
    expect(s.seq).toHaveLength(4);
  });

  it("ignores presses while the computer plays", () => {
    const s = begin(newGame(1));
    expect(press(s, s.seq[0])).toBe(s);
    expect(press(newGame(1), 0).phase).toBe("ready");
  });

  it("ends calmly on a miss, keeping the reached length", () => {
    let s = playBack(begin(newGame(3)));
    s = playBack(s); // score 2, sequence of 3
    s = shown(s);
    s = press(s, s.seq[0]);
    const wrong = (s.seq[1] + 1) % 4;
    s = press(s, wrong);
    expect(s.phase).toBe("over");
    expect(s.score).toBe(2);
    expect(s.missed).toBe(wrong);
    expect(press(s, 0)).toBe(s);
  });

  it("can replay the sequence without penalty", () => {
    let s = shown(begin(newGame(9)));
    s = replay(s);
    expect(s.phase).toBe("show");
    expect(s.score).toBe(0);
  });

  it("restores exactly from a saved (JSON) state", () => {
    let a = playBack(playBack(begin(newGame(123))));
    let b: State = JSON.parse(JSON.stringify(a));
    a = playBack(a);
    b = playBack(b);
    expect(b).toEqual(a);
  });
});
