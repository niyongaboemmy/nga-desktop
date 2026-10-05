import { describe, expect, it } from "vitest";
import { CATEGORIES, convert, parseNumber, show } from "./units";

describe("unit converter", () => {
  it("every listed unit converts to every other unit in its category", () => {
    for (const c of CATEGORIES) {
      for (const a of c.units) for (const b of c.units) {
        expect(convert(1, a.id, b.id), `${c.id}: ${a.id} -> ${b.id}`).not.toBeNull();
      }
    }
  });

  it.each([
    [1, "km", "m", "1000"],
    [1, "inch", "cm", "2.54"],
    [1, "mi", "km", "1.609344"],
    [100, "degC", "degF", "212"],
    [0, "degC", "K", "273.15"],
    [-40, "degF", "degC", "-40"],
    [1, "hectare", "m2", "10000"],
    [1, "L", "mL", "1000"],
    [36, "km/h", "m/s", "10"],
    [1, "hour", "s", "3600"],
    [1, "kWh", "J", "3600000"],
    [1, "atm", "kPa", "101.325"],
    [180, "deg", "rad", "3.141592654"],
    [1, "B", "b", "8"],
    [1, "KiB", "B", "1024"],
    [1, "kB", "B", "1000"],
    [1, "tonne", "kg", "1000"],
  ])("%s %s = %s %s", (v, from, to, want) => {
    expect(show(convert(v, from, to))).toBe(want);
  });

  it("refuses mismatched units", () => {
    expect(convert(1, "kg", "m")).toBeNull();
    expect(convert(NaN, "kg", "g")).toBeNull();
  });

  it("reads numbers the way people type them", () => {
    expect(parseNumber("1,5")).toBe(1.5);
    expect(parseNumber("1 000")).toBe(1000);
    expect(parseNumber("1,000,000")).toBe(1000000);
    expect(parseNumber("2.5e3")).toBe(2500);
    expect(parseNumber("-.5")).toBe(-0.5);
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });

  it("shows tidy numbers", () => {
    expect(show(0.1 + 0.2)).toBe("0.3");
    expect(show(1e20)).toBe("1e+20");
    expect(show(null)).toBe("—");
  });
});
