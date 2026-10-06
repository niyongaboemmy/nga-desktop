// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { newNote, render, searchNotes, sortNotes, tags, title, type Note } from "./noteModel";

const note = (body: string, extra: Partial<Note> = {}): Note => ({ ...newNote(1), body, ...extra });

describe("notes", () => {
  it("titles come from the first line", () => {
    expect(title(note("\n\n# Physics revision\nmore"))).toBe("Physics revision");
    expect(title(note("**Bold** start"))).toBe("Bold start");
    expect(title(note(""))).toBe("");
  });

  it("finds #tags (any language)", () => {
    expect(tags("Read #chemistry and #Imibare, not # alone or a#b")).toEqual(["chemistry", "imibare"]);
  });

  it("sorts pinned first, then newest", () => {
    const a = note("a", { updatedAt: 3 }), b = note("b", { updatedAt: 9 }), c = note("c", { pinned: true, updatedAt: 1 });
    expect(sortNotes([a, b, c]).map((n) => n.body)).toEqual(["c", "b", "a"]);
  });

  it("searches every word, ignoring case and accents", () => {
    const list = [note("Révision de chimie #exam"), note("Physics lab"), note("chimie organique")];
    expect(searchNotes(list, "revision CHIMIE").map((n) => n.body)).toEqual(["Révision de chimie #exam"]);
    expect(searchNotes(list, "#exam")).toHaveLength(1);
    expect(searchNotes(list, "")).toHaveLength(3);
  });

  it("renders Markdown and maths safely", () => {
    const html = render("# Title\n\nArea $A = \\pi r^2$ and **bold**\n\n$$E=mc^2$$");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("katex");
    expect(html).toContain("katex-display");
  });

  it("strips scripts and handlers", () => {
    const html = render('<script>alert(1)</script><img src=x onerror="alert(2)"> [x](javascript:alert(3))');
    expect(html).not.toMatch(/<script|onerror|href="javascript:/i);
    expect(render("[x](javascript:alert(3))")).not.toMatch(/href="javascript:/i);
  });

  it("new notes get unique ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newNote().id));
    expect(ids.size).toBe(50);
  });

  it("renders LaTeX's own \\( … \\) and \\[ … \\] delimiters (AI answers use them)", () => {
    const html = render("Solve \\(3x + 5 = 20\\):\n\n\\[x = \\frac{15}{3}\\]");
    expect(html).toContain("katex");
    expect(html).toContain("katex-display");
    expect(html).not.toContain("\\(");
  });
});
