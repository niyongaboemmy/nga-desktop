import { describe, expect, it } from "vitest";
import { ROUTINES, STEP_SEC, at, skip, totalSec } from "./logic";
import { strings } from "./strings";

describe("stand & stretch", () => {
  it("has six two-minute routines with text for every move", () => {
    expect(ROUTINES).toHaveLength(6);
    for (const r of ROUTINES) {
      expect(totalSec(r.id)).toBe(120);
      expect(strings.en).toHaveProperty(r.id);
      for (const s of r.steps) expect(strings.en[s], s).toBeTruthy();
    }
  });
  it("moves through the steps and ends", () => {
    expect(at({ routine: "desk", elapsed: 0 })).toEqual({ index: 0, left: STEP_SEC, over: false });
    expect(at({ routine: "desk", elapsed: 30 })).toEqual({ index: 1, left: 18, over: false });
    expect(at({ routine: "desk", elapsed: 120 }).over).toBe(true);
    expect(skip({ routine: "desk", elapsed: 30 }, 1).elapsed).toBe(48);
    expect(skip({ routine: "desk", elapsed: 30 }, -1).elapsed).toBe(0);
    expect(at(JSON.parse(JSON.stringify({ routine: "eyes", elapsed: 50 })))).toEqual(at({ routine: "eyes", elapsed: 50 }));
  });
});
