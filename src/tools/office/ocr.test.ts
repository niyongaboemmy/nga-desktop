import { describe, expect, it } from "vitest";
import { cleanText, joinPages } from "./ocr";

describe("OCR text", () => {
  it("rejoins words split across lines and tidies spacing", () => {
    expect(cleanText("Plants make food by photo-\nsynthesis.  They  need\nlight   \n\n\n\nand water.\r\n")).toBe(
      "Plants make food by photosynthesis. They need\nlight\n\nand water.",
    );
    // A real dash before a capital (or a list) stays.
    expect(cleanText("Rwanda-\nKigali")).toBe("Rwanda-\nKigali");
    expect(cleanText("élé-\nments")).toBe("éléments");
  });

  it("labels pages only when there are several", () => {
    expect(joinPages(["one"], (n) => `Page ${n}`)).toBe("one");
    expect(joinPages(["a", "b"], (n) => `— Page ${n} —`)).toBe("— Page 1 —\n\na\n\n— Page 2 —\n\nb");
  });
});
