import { describe, expect, it } from "vitest";
import { faceUp, flip, hide, newGame, type State } from "./logic";
import { SETS, SET_IDS, label } from "./sets";

const partner = (s: State, i: number) => s.cards.findIndex((c, j) => j !== i && c.pair === s.cards[i].pair);
const other = (s: State, i: number) => s.cards.findIndex((c) => c.pair !== s.cards[i].pair);

describe("pairs", () => {
  it("deals each pair once, both sides, for every set and size", () => {
    for (const set of SET_IDS)
      for (const size of [12, 16, 20] as const) {
        const s = newGame(7, set, size);
        expect(s.cards).toHaveLength(Math.min(size, SETS[set].length * 2));
        const pairs = new Map<number, string[]>();
        for (const c of s.cards) pairs.set(c.pair, [...(pairs.get(c.pair) ?? []), c.side]);
        for (const sides of pairs.values()) expect(sides.sort()).toEqual(["a", "b"]);
      }
    expect(newGame(7)).toEqual(newGame(7));
  });

  it("every set has at least 10 pairs and labels in every language", () => {
    for (const set of SET_IDS) {
      expect(SETS[set].length, set).toBeGreaterThanOrEqual(10);
      for (const it of SETS[set]) for (const lang of ["en", "fr", "rw"] as const) expect(label(it.a, lang)).toBeTruthy();
    }
  });

  it("keeps matches, counts moves, turns a mismatch back", () => {
    let s = newGame(3, "capitals", 12);
    const a = 0, b = partner(s, 0), c = other(s, 0);
    s = flip(s, a);
    expect(flip(s, a)).toBe(s); // the same card twice does nothing
    s = flip(s, c);
    expect([s.open, s.moves]).toEqual([[a, c], 1]);
    expect(flip(s, b)).toBe(s); // wait until the mismatch is turned back
    s = hide(s);
    expect(s.open).toEqual([]);
    s = flip(flip(s, a), b);
    expect([faceUp(s, a), faceUp(s, b), s.scores[0], s.moves]).toEqual([true, true, 1, 2]);
  });

  it("finishes when everything matches, and replays after a save", () => {
    let s = newGame(11, "shapes", 12);
    const restored: State = JSON.parse(JSON.stringify(s));
    expect(restored).toEqual(s);
    for (let i = 0; i < s.cards.length; i++) if (!s.matched[i]) s = flip(flip(s, i), partner(s, i));
    expect(s.done).toBe(true);
    expect(s.moves).toBe(6);
  });

  it("2 players: a match plays again, a miss passes the turn", () => {
    let s = newGame(5, "words", 12, 2);
    s = flip(flip(s, 0), partner(s, 0));
    expect([s.turn, s.scores]).toEqual([0, [1, 0]]);
    const i = s.matched.findIndex((m) => !m);
    const k = s.cards.findIndex((c, j) => !s.matched[j] && c.pair !== s.cards[i].pair);
    s = hide(flip(flip(s, i), k));
    expect(s.turn).toBe(1);
  });
});
