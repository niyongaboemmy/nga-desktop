import { describe, expect, it } from "vitest";
import { compileFunction, intersections, niceStep, parametersOf, sample, zeros } from "./graphMath";

const f = (e: string, p = {}) => {
  const r = compileFunction(e, p);
  if ("error" in r) throw new Error(r.error);
  return r.fn;
};

describe("grapher maths", () => {
  it("compiles the ways people type functions", () => {
    expect(f("y = 2x^2 - 3")(2)).toBe(5);
    expect(f("f(x)=sin(x)")(Math.PI / 2)).toBeCloseTo(1);
    expect(f("a*x+b", { a: 2, b: 1 })(3)).toBe(7);
    expect("error" in compileFunction("2x+")).toBe(true);
    expect("error" in compileFunction("")).toBe(true);
    expect("error" in compileFunction('evaluate("1")')).toBe(true);
  });

  it("finds the parameters", () => {
    expect(parametersOf("a*x^2 + b*x + c")).toEqual(["a", "b", "c"]);
    expect(parametersOf("y = sin(x) + e")).toEqual([]);
  });

  it("finds zeros and intersections", () => {
    expect(zeros(f("x^2 - 4"), -10, 10)).toEqual([-2, 2]);
    expect(zeros(f("sin(x)"), -0.5, 7)).toEqual([0, 3.141592654, 6.283185307]);
    expect(zeros(f("1/x"), -5, 5)).toEqual([]);
    const xs = intersections(f("x^2"), f("x + 2"), -10, 10);
    expect(xs).toEqual([-1, 2]);
  });

  it("breaks the line at asymptotes", () => {
    const segs = sample(f("tan(x)"), -3, 3, 600, 50);
    expect(segs.length).toBeGreaterThanOrEqual(3);
    expect(sample(f("x"), -1, 1, 10, 50)).toHaveLength(1);
  });

  it("picks nice grid steps", () => {
    expect(niceStep(20)).toBe(2);
    expect(niceStep(10)).toBe(1);
    expect(niceStep(0.5)).toBeCloseTo(0.05);
    expect(niceStep(350)).toBe(50);
  });
});
