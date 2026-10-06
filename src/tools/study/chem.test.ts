import { describe, expect, it } from "vitest";
import { ELEMENT_LIST, FormulaError, element, molarMass, parseFormula, position } from "./chem";

describe("periodic table", () => {
  it("has all 118 elements with unique grid cells", () => {
    expect(ELEMENT_LIST).toHaveLength(118);
    const cells = new Set(ELEMENT_LIST.map((e) => `${e.row}:${e.col}`));
    expect(cells.size).toBe(118);
  });

  it("places elements in the right period and group", () => {
    const pg = (z: number) => { const p = position(z); return [p.period, p.group]; };
    expect(pg(1)).toEqual([1, 1]);
    expect(pg(2)).toEqual([1, 18]);
    expect(pg(5)).toEqual([2, 13]);
    expect(pg(17)).toEqual([3, 17]);
    expect(pg(26)).toEqual([4, 8]);
    expect(pg(30)).toEqual([4, 12]);
    expect(pg(56)).toEqual([6, 2]);
    expect(pg(72)).toEqual([6, 4]);
    expect(pg(79)).toEqual([6, 11]);
    expect(pg(86)).toEqual([6, 18]);
    expect(pg(118)).toEqual([7, 18]);
    expect(position(57)).toEqual({ period: 6, group: null, row: 9, col: 3 });
    expect(position(103)).toEqual({ period: 7, group: null, row: 10, col: 17 });
  });

  it("knows the elements", () => {
    expect(element("Fe")).toMatchObject({ z: 26, name: "Iron", category: "Transition metal" });
    expect(element("Xx")).toBeNull();
  });
});

describe("molar mass", () => {
  const m = (f: string) => molarMass(f).total;
  it.each([
    ["H2O", 18.015],
    ["CO2", 44.009],
    ["Ca(OH)2", 74.094],
    ["Fe2(SO4)3", 399.85],
    ["CuSO4·5H2O", 249.691],
    ["CuSO4.5H2O", 249.691],
    ["(NH4)3PO4", 149.087],
    ["C6H12O6", 180.156],
    ["[Cu(NH3)4]SO4", 227.738],
    ["NaCl", 58.44],
  ])("%s = %s g/mol", (f, want) => {
    expect(m(f)).toBeCloseTo(want, 1);
  });

  it("counts atoms through brackets and hydrates", () => {
    expect(Object.fromEntries(parseFormula("Fe2(SO4)3"))).toEqual({ Fe: 2, S: 3, O: 12 });
    expect(Object.fromEntries(parseFormula("CuSO4·5H2O"))).toEqual({ Cu: 1, S: 1, O: 9, H: 10 });
  });

  it("gives the mass percentages", () => {
    const water = molarMass("H2O");
    expect(water.parts.find((p) => p.symbol === "O")!.percent).toBeCloseTo(88.81, 1);
  });

  it("refuses bad formulas clearly", () => {
    for (const bad of ["", "h2o", "Xx2", "Ca(OH2", "Ca)OH(2", "(", "2"]) expect(() => parseFormula(bad), bad).toThrow(FormulaError);
    try { parseFormula("NaXy"); } catch (e) { expect((e as Error).message).toBe("unknown:Xy"); }
  });
});
