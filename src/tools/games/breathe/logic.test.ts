import { describe, expect, it } from "vitest";
import { PATTERNS, cycleLength, done, phaseAt } from "./logic";

describe("breathe", () => {
  const box = PATTERNS[0];
  it("walks through the phases", () => {
    expect(cycleLength(box)).toBe(16);
    expect(phaseAt(box, 0)).toMatchObject({ phase: "in", left: 4, cycle: 0 });
    expect(phaseAt(box, 5)).toMatchObject({ phase: "holdIn", left: 3 });
    expect(phaseAt(box, 9.5)).toMatchObject({ phase: "out", left: 3 });
    expect(phaseAt(box, 15)).toMatchObject({ phase: "holdOut", left: 1 });
    expect(phaseAt(box, 16)).toMatchObject({ phase: "in", cycle: 1 });
    expect(phaseAt(PATTERNS[1], 7)).toMatchObject({ phase: "out", left: 5 });
  });
  it("ends after the chosen minutes and survives a save", () => {
    const s = { pattern: "box" as const, minutes: 1 as const, elapsed: 59 };
    expect(done(s)).toBe(false);
    expect(done({ ...JSON.parse(JSON.stringify(s)), elapsed: 60 })).toBe(true);
  });
});
