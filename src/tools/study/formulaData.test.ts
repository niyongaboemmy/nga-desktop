import { describe, expect, it } from "vitest";
import katex from "katex";
import { FORMULAS, searchFormulas } from "./formulaData";

describe("formula sheets", () => {
  it("every formula renders with KaTeX", () => {
    for (const f of FORMULAS) expect(() => katex.renderToString(f.tex, { throwOnError: true }), `${f.subject}: ${f.name}`).not.toThrow();
  });

  it("covers the four science subjects", () => {
    for (const s of ["maths", "physics", "chemistry", "biology"]) expect(FORMULAS.filter((f) => f.subject === s).length).toBeGreaterThanOrEqual(5);
  });

  it("searches names, topics and notes", () => {
    expect(searchFormulas(FORMULAS, "quadratic")[0].name).toBe("Quadratic formula");
    expect(searchFormulas(FORMULAS, "ohm").some((f) => f.tex.includes("V = IR"))).toBe(true);
    expect(searchFormulas(FORMULAS, "kelvin gas").length).toBeGreaterThanOrEqual(1);
    expect(searchFormulas(FORMULAS, "zzzz")).toEqual([]);
  });
});
