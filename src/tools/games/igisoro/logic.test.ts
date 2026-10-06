import { describe, expect, it } from "vitest";
import { facing, fromScreen, g, legalPits, move, newGame, screenPos, total, VARIANTS, type State } from "./logic";

const empty = (variant = "standard"): State => ({ variant, pits: Array(32).fill(0), turn: 0, winner: -1, last: null, moves: 0 });
const put = (s: State, at: Record<number, number>): State => {
  const pits = s.pits.slice();
  for (const [k, v] of Object.entries(at)) pits[Number(k)] = v;
  return { ...s, pits };
};

describe("igisoro", () => {
  it("defines variants with 32 seeds per player and falls back to standard", () => {
    for (const v of Object.values(VARIANTS)) {
      expect(v.initial).toHaveLength(16);
      expect(total(v.initial)).toBe(32);
    }
    expect(newGame(null).variant).toBe("standard");
    expect(newGame("nonsense").variant).toBe("standard");
    expect(newGame("beginner").pits.every((n) => n === 2)).toBe(true);
    const s = newGame();
    expect(total(s.pits)).toBe(64);
    expect(s.pits.slice(0, 8)).toEqual([4, 4, 4, 4, 4, 4, 4, 4]);
  });

  it("maps pits to the screen consistently and faces the right opponent pits", () => {
    for (const p of [0, 1] as const)
      for (let i = 0; i < 16; i++) {
        const [r, c] = screenPos(p, i);
        expect(fromScreen(r, c)).toEqual([p, i]);
      }
    // Player 0's front pit in screen column 2 faces player 1's pits in screen column 2.
    const i0 = 15 - 2;
    const [f, b] = facing(i0);
    expect(screenPos(1, f)).toEqual([1, 2]);
    expect(screenPos(1, b)).toEqual([0, 2]);
    // And the other way round.
    const [f1, b1] = facing(8 + 2); // player 1 front at screen col 2
    expect(screenPos(0, f1)).toEqual([2, 2]);
    expect(screenPos(0, b1)).toEqual([3, 2]);
  });

  it("sows counter-clockwise around the player's own two rows only", () => {
    // Player 0: 3 seeds in back pit 6 -> pits 7 (back right), 8, 9 (front row, right to left).
    const s = put(empty(), { [g(0, 6)]: 3, [g(1, 0)]: 2 });
    const { state } = move(s, 6);
    expect(state.pits[g(0, 6)]).toBe(0);
    expect([7, 8, 9].map((i) => state.pits[g(0, i)])).toEqual([1, 1, 1]);
    expect(screenPos(0, 7)).toEqual([3, 7]);
    expect(screenPos(0, 8)).toEqual([2, 7]);
    expect(screenPos(0, 9)).toEqual([2, 6]);
    // Wraps from the end of the front row back to the start of the back row.
    const w = move(put(empty(), { [g(0, 14)]: 3, [g(1, 0)]: 2 }), 14).state;
    expect([15, 0, 1].map((i) => w.pits[g(0, i)])).toEqual([1, 1, 1]);
    expect(total(w.pits.slice(16))).toBe(2); // the opponent is untouched
  });

  it("relays: lifts an occupied landing pit and sows on", () => {
    // 2 seeds from pit 0 -> 1, 2; pit 2 already had 3 -> now 4, lifted and sown 3..6.
    const s = put(empty(), { [g(0, 0)]: 2, [g(0, 2)]: 3, [g(1, 0)]: 2 });
    const { state, frames } = move(s, 0);
    expect(state.pits.slice(0, 8)).toEqual([0, 1, 0, 1, 1, 1, 1, 0]);
    expect(frames.filter((f) => f.kind === "lift")).toHaveLength(2);
    expect(state.last?.end).toBe(g(0, 6));
    // Beginner: no relay, the move ends there.
    const b = move({ ...s, variant: "beginner" }, 0).state;
    expect(b.pits.slice(0, 8)).toEqual([0, 1, 4, 0, 0, 0, 0, 0]);
  });

  it("captures both facing pits and sows them from the starting pit", () => {
    // Player 0 sows 2 from pit 7: 8, 9. Pit 9 (front, own column 6) already has 1 seed.
    const [f, b] = facing(9);
    const s = put(empty(), { [g(0, 7)]: 2, [g(0, 9)]: 1, [g(1, f)]: 2, [g(1, b)]: 1, [g(1, 3)]: 2 });
    const { state, frames } = move(s, 7);
    expect(state.last?.captured).toBe(3);
    // The capture sowing starts in pit 7 itself.
    const at = frames.findIndex((x) => x.kind === "capture");
    expect(frames[at + 1].at).toBe(g(0, 7));
    expect(frames.some((x) => x.kind === "capture")).toBe(true);
    expect(state.pits[g(1, f)]).toBe(0);
    expect(state.pits[g(1, b)]).toBe(0);
    // 3 captured seeds go into 7 (the start), 8, 9; 9 is occupied -> relay on.
    expect(total(state.pits)).toBe(total(s.pits));
    expect(total(state.pits.slice(0, 16))).toBe(3 + 3);
    // Only one facing pit full: no capture under "inner-both".
    const s2 = put(s, { [g(1, b)]: 0 });
    expect(move(s2, 7).state.last?.captured).toBe(0);
    // ...but a capture under "inner-either".
    VARIANTS.either = { ...VARIANTS.standard, capture: "inner-either" };
    expect(move({ ...s2, variant: "either" }, 7).state.last?.captured).toBe(2);
    delete VARIANTS.either;
  });

  it("does not capture from the back row", () => {
    // Last seed lands in occupied back pit 3: relay, not capture.
    const s = put(empty(), { [g(0, 1)]: 2, [g(0, 3)]: 1, [g(1, 8)]: 3, [g(1, 7)]: 3 });
    expect(move(s, 1).state.last?.captured).toBe(0);
  });

  it("needs a pit with enough seeds, and ends when a player cannot move", () => {
    const s = put(empty(), { [g(0, 0)]: 1, [g(0, 5)]: 2, [g(1, 0)]: 1 });
    expect(legalPits(s)).toEqual([5]);
    expect(move(s, 0).state).toBe(s);
    const { state } = move(s, 5);
    // Player 1 has only a single seed: no legal move, player 0 wins.
    expect(state.winner).toBe(0);
    expect(move(state, 0).state).toBe(state);
    // With singles allowed, the same position goes on.
    expect(move({ ...s, variant: "singles" }, 5).state.winner).toBe(-1);
  });

  it("keeps all 64 seeds through whole games", () => {
    for (const variant of Object.keys(VARIANTS)) {
      let s = newGame(variant);
      let k = 7;
      for (let n = 0; n < 400 && s.winner === -1; n++) {
        const legal = legalPits(s);
        k = (k * 31 + 11) % 997;
        const { state, frames } = move(s, legal[k % legal.length]);
        expect(state).not.toBe(s);
        expect(total(state.pits)).toBe(64);
        for (const f of frames) expect(total(f.pits) + f.hand).toBe(64);
        s = state;
      }
    }
  });

  it("survives a save and restore", () => {
    let s = newGame();
    s = move(s, 3).state;
    s = move(s, legalPits(s)[0]).state;
    const b: State = JSON.parse(JSON.stringify(s));
    expect(b).toEqual(s);
    expect(move(b, legalPits(b)[0])).toEqual(move(s, legalPits(s)[0]));
  });
});
