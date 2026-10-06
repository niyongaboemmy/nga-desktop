import { describe, expect, it } from "vitest";
import { buildRows, counts, filterRows, groupOf, problem } from "./translationModel";
import { sourceHash } from "../i18n/overrides";

const en = { "tool.pdf": "PDF tools", "pdf.pages": "{n} pages", "games.lock.off": "Games are off", "timer.min": "{n} min" };
const fr = { "tool.pdf": "Outils PDF", "pdf.pages": "{n} pages", "games.lock.off": "Jeux désactivés", "timer.min": "{n} min" };
const e = (text: string, status: "draft" | "ai_draft" | "approved", english: string) => ({ text, status, sourceHash: sourceHash(english), updatedBy: "A", updatedAt: "x", approvedBy: null });

describe("translation workspace model", () => {
  it("groups keys by tool", () => {
    expect(groupOf("tool.pdf.desc")).toBe("pdf");
    expect(groupOf("game.mines")).toBe("mines");
    expect(groupOf("games.lock.off")).toBe("games");
  });

  it("derives status, current text and what is unpublished", () => {
    const rows = buildRows(
      en,
      fr,
      {
        "tool.pdf": e("Outils PDF (relu)", "approved", "PDF tools"),
        "pdf.pages": e("{n} feuilles", "draft", "{n} pages"),
        "games.lock.off": e("Jeux coupés", "approved", "Games were off"), // English changed since
      },
      { "timer.min": { t: "{n} minutes", h: sourceHash("{n} min") }, "tool.pdf": { t: "Outils PDF (relu)", h: sourceHash("PDF tools") } },
    );
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by["tool.pdf"]).toMatchObject({ status: "approved", unpublished: false, current: "Outils PDF (relu)" });
    expect(by["pdf.pages"]).toMatchObject({ status: "draft", unpublished: false, current: "{n} pages" });
    expect(by["games.lock.off"]).toMatchObject({ status: "outdated", unpublished: false });
    expect(by["timer.min"]).toMatchObject({ status: "untouched", current: "{n} minutes" });
    expect(counts(rows)).toMatchObject({ approved: 1, draft: 1, outdated: 1, untouched: 1, unpublished: 0 });
    // A new approval not yet released.
    const again = buildRows(en, fr, { "pdf.pages": e("{n} feuilles", "approved", "{n} pages") }, {});
    expect(counts(again).unpublished).toBe(1);
  });

  it("filters by search (accents ignored), status and group", () => {
    const rows = buildRows(en, fr, { "pdf.pages": e("{n} feuilles", "draft", "{n} pages") }, {});
    expect(filterRows(rows, "desactives", "all", "").map((r) => r.key)).toEqual(["games.lock.off"]);
    expect(filterRows(rows, "", "draft", "").map((r) => r.key)).toEqual(["pdf.pages"]);
    expect(filterRows(rows, "", "all", "pdf").map((r) => r.key).sort()).toEqual(["pdf.pages", "tool.pdf"]);
  });

  it("checks a translation before saving", () => {
    expect(problem("{n} pages", "  ")).toBe("empty");
    expect(problem("{n} pages", "pages")).toBe("placeholders");
    expect(problem("{n} of {total}", "{total} sur {n}")).toBeNull();
    expect(problem("x", "y".repeat(2001))).toBe("long");
  });
});
