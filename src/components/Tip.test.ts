import { describe, expect, it } from "vitest";
import { bubbleLayout } from "./Tip";

describe("tooltip layout", () => {
  it("centres the bubble on the arrow", () => {
    expect(bubbleLayout(180, 100, 360)).toEqual({ left: 130, arrowLeft: 45 });
  });
  it("keeps the bubble inside the window and the arrow on the button", () => {
    const right = bubbleLayout(350, 120, 360);
    expect(right.left).toBe(236);
    // The arrow stays on the button, but never closer than 8 px to the rounded corner.
    expect(right.left + right.arrowLeft + 5).toBe(236 + 120 - 8);
    const left = bubbleLayout(6, 120, 360);
    expect(left.left).toBe(4);
    expect(left.arrowLeft).toBe(3); // never past the bubble's rounded corner
  });
});
