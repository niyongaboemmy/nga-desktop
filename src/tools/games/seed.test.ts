import { describe, expect, it } from "vitest";
import { dailySeed, hash, kigaliDay, kigaliMinutes, rng, shuffle } from "./seed";

describe("game seeds", () => {
  it("uses the Kigali date (UTC+2)", () => {
    expect(kigaliDay(Date.parse("2026-10-05T21:59:00Z"))).toBe("2026-10-05");
    expect(kigaliDay(Date.parse("2026-10-05T22:00:00Z"))).toBe("2026-10-06");
    expect(kigaliMinutes(Date.parse("2026-10-05T06:30:00Z"))).toBe(8 * 60 + 30);
  });

  it("gives everyone the same daily seed, a new one each day and per game", () => {
    const a = dailySeed("number-place", Date.parse("2026-10-05T08:00:00Z"));
    expect(dailySeed("number-place", Date.parse("2026-10-05T15:00:00Z"))).toBe(a);
    expect(dailySeed("number-place", Date.parse("2026-10-06T08:00:00Z"))).not.toBe(a);
    expect(dailySeed("picture-logic", Date.parse("2026-10-05T08:00:00Z"))).not.toBe(a);
    expect(hash("abc")).toBe(hash("abc"));
  });

  it("replays exactly from a seed", () => {
    const a = rng(42), b = rng(42);
    const xs = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(shuffle([1, 2, 3, 4, 5, 6], rng(7))).toEqual(shuffle([1, 2, 3, 4, 5, 6], rng(7)));
    expect(shuffle([1, 2, 3, 4, 5, 6], rng(7)).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
