import { describe, expect, it } from "vitest";
import { addValues, evaluate, formatValue, normalise, zero } from "./engine";

const calc = (e: string, mode: "deg" | "rad" = "deg", ans?: unknown) => {
  const r = evaluate(e, mode, ans);
  return r.ok ? r.text : `!${r.error}`;
};

describe("calculator engine", () => {
  const golden: Array<[string, string, ("deg" | "rad")?]> = [
    // arithmetic and precedence
    ["2+3*4", "14"],
    ["(2+3)*4", "20"],
    ["10/4", "2.5"],
    ["7-10", "-3"],
    ["-3^2", "-9"],
    ["(-3)^2", "9"],
    ["2^10", "1024"],
    ["2^-1", "0.5"],
    ["1e3 + 1", "1001"],
    ["0.1+0.2", "0.3"],
    ["0.1*3", "0.3"],
    ["1/3*3", "1"],
    ["12 × 3", "36"],
    ["12 ÷ 4", "3"],
    ["12 − 4", "8"],
    ["1,000,000 / 1,000", "1000"],
    ["5!", "120"],
    ["0!", "1"],
    ["10 nCr 3", "120"],
    ["5 nPr 2", "20"],
    ["sqrt(16)", "4"],
    ["√(81)", "9"],
    ["√2^2", "2"],
    ["cbrt(27)", "3"],
    ["abs(-7.5)", "7.5"],
    ["7 mod 3", "1"],
    ["50% * 200", "100"],
    ["round(3.14159, 2)", "3.14"],
    ["floor(-2.5)", "-3"],
    ["ceil(2.1)", "3"],
    // logs
    ["log(1000)", "3"],
    ["ln(e)", "1"],
    ["log(100) + ln(1)", "2"],
    ["log2(8)", "3"],
    ["exp(0)", "1"],
    // trigonometry, degrees
    ["sin(30)", "0.5"],
    ["cos(60)", "0.5"],
    ["tan(45)", "1"],
    ["sin(90)", "1"],
    ["cos(180)", "-1"],
    ["asin(0.5)", "30"],
    ["acos(0)", "90"],
    ["atan(1)", "45"],
    ["sin(30 deg)", "0.5"],
    // trigonometry, radians
    ["sin(pi/2)", "1", "rad"],
    ["cos(pi)", "-1", "rad"],
    ["sin(π/6)", "0.5", "rad"],
    ["atan(1)*4", "3.1415926535898", "rad"],
    // constants
    ["pi", "3.1415926535898"],
    ["e", "2.718281828459"],
    // big and small numbers
    ["2^64", "1.844674407371e+19"],
    ["1/7", "0.14285714285714"],
    ["0.000000001 * 2", "0.000000002"],
    ["1e-12 * 2", "2e-12"],
    // units
    ["5 km to m", "5000 m"],
    ["100 cm to inch", "39.370078740157 inch"],
    ["2 hours to minute", "120 minute"],
    // complex
    ["sqrt(-4)", "2i"],
    // variables in one line
    ["a = 3; a * 4", "12"],
    // whitespace
    ["  2 +   2  ", "4"],
  ];
  it.each(golden)("%s = %s", (expr, want, mode) => {
    expect(calc(expr, mode ?? "deg")).toBe(want);
  });

  it("uses Ans", () => {
    const first = evaluate("6*7");
    expect(first.ok).toBe(true);
    const ans = first.ok ? first.value : undefined;
    expect(calc("Ans / 2", "deg", ans)).toBe("21");
    expect(calc("ans+1", "deg", ans)).toBe("43");
  });

  it("explains errors in plain words", () => {
    expect(calc("")).toBe("!empty");
    expect(calc("   ")).toBe("!empty");
    expect(calc("2+")).toBe("!syntax");
    expect(calc("(2+3")).toBe("!syntax");
    expect(calc("1/0")).toBe("!infinite");
    expect(calc("foo + 1")).toBe("!unknown");
  });

  it("refuses the functions that can escape the sandbox", () => {
    for (const bad of ['import({x: 1})', 'evaluate("1+1")', 'parse("1")', 'createUnit("foo")', 'simplify("x+x")', 'derivative("x^2", "x")']) {
      const r = evaluate(bad);
      expect(r.ok, bad).toBe(false);
    }
  });

  it("shows exact fractions for simple non-integers", () => {
    const f = (e: string) => {
      const r = evaluate(e);
      return r.ok ? r.fraction : "err";
    };
    expect(f("1/3")).toBe("1/3");
    expect(f("1/2+1/6")).toBe("2/3");
    expect(f("7/4")).toBe("7/4 = 1 3/4");
    expect(f("-7/4")).toBe("-7/4 = -1 3/4");
    expect(f("4")).toBeNull();
    expect(f("pi")).toBeNull();
  });

  it("normalises calculator spellings", () => {
    expect(normalise("ln(2) + log(3)")).toBe("log(2) + log10(3)");
    expect(normalise("2×π÷3−1")).toBe("2*pi/3-1");
  });

  it("memory arithmetic adds and subtracts", () => {
    const five = evaluate("5");
    const two = evaluate("2");
    if (!five.ok || !two.ok) throw new Error("setup");
    const m = addValues(addValues(zero(), five.value), two.value, -1);
    expect(formatValue(m)).toBe("3");
  });
});
