// Periodic table helpers and molar mass (pure, unit-tested).
import { ELEMENTS, type ElementRow } from "./elementData";

export interface Element {
  z: number;
  symbol: string;
  name: string;
  mass: number;
  config: string;
  electronegativity: number | null;
  state: string;
  meltK: number | null;
  boilK: number | null;
  density: number | null;
  category: string;
  period: number;
  group: number | null;
  /** Grid position: row 1–7 main table, 9–10 lanthanides/actinides; column 1–18. */
  row: number;
  col: number;
}

/** Period, group and grid cell of element Z (IUPAC 18-column layout, f-block below). */
export function position(z: number): { period: number; group: number | null; row: number; col: number } {
  const starts = [1, 3, 11, 19, 37, 55, 87, 119];
  const period = starts.findIndex((s, i) => z >= s && z < starts[i + 1]) + 1;
  if (z >= 57 && z <= 71) return { period: 6, group: null, row: 9, col: z - 57 + 3 };
  if (z >= 89 && z <= 103) return { period: 7, group: null, row: 10, col: z - 89 + 3 };
  const i = z - starts[period - 1];
  let group: number;
  if (period === 1) group = z === 1 ? 1 : 18;
  else if (period <= 3) group = i < 2 ? i + 1 : i + 11;
  else if (period <= 5) group = i + 1;
  else group = i < 2 ? i + 1 : i - 13; // after the 15 f-block elements
  return { period, group, row: period, col: group };
}

export const ELEMENT_LIST: Element[] = ELEMENTS.map((r: ElementRow) => {
  const p = position(r[0]);
  return {
    z: r[0], symbol: r[1], name: r[2], mass: r[3], config: r[4], electronegativity: r[5], state: r[6],
    meltK: r[7], boilK: r[8], density: r[9], category: r[10], period: p.period, group: p.group, row: p.row, col: p.col,
  };
});

const BY_SYMBOL = new Map(ELEMENT_LIST.map((e) => [e.symbol, e]));
export const element = (symbol: string) => BY_SYMBOL.get(symbol) ?? null;

export class FormulaError extends Error {}

/**
 * Element counts in a formula: brackets, nested groups and hydrates.
 * "Ca(OH)2", "Fe2(SO4)3", "CuSO4·5H2O" (· . * + also accepted), "[Cu(NH3)4]SO4".
 */
export function parseFormula(input: string): Map<string, number> {
  const src = input.replace(/\s+/g, "").replace(/[·•∙*]/g, ".");
  if (!src) throw new FormulaError("empty");
  const total = new Map<string, number>();
  const add = (into: Map<string, number>, from: Map<string, number>, k: number) => from.forEach((n, s) => into.set(s, (into.get(s) ?? 0) + n * k));
  for (const part of src.split(/[.+]/)) {
    if (!part) throw new FormulaError("syntax");
    const lead = /^(\d+)(.*)$/.exec(part);
    const coeff = lead ? Number(lead[1]) : 1;
    const body = lead ? lead[2] : part;
    let i = 0;
    const group = (close: string | null): Map<string, number> => {
      const m = new Map<string, number>();
      while (i < body.length) {
        const ch = body[i];
        if (ch === "(" || ch === "[") {
          i++;
          const inner = group(ch === "(" ? ")" : "]");
          add(m, inner, num());
        } else if (ch === ")" || ch === "]") {
          if (ch !== close) throw new FormulaError("brackets");
          i++;
          return m;
        } else {
          const sym = /^[A-Z][a-z]?/.exec(body.slice(i));
          if (!sym) throw new FormulaError("syntax");
          if (!BY_SYMBOL.has(sym[0])) throw new FormulaError(`unknown:${sym[0]}`);
          i += sym[0].length;
          m.set(sym[0], (m.get(sym[0]) ?? 0) + num());
        }
      }
      if (close) throw new FormulaError("brackets");
      return m;
    };
    const num = () => {
      const d = /^\d+/.exec(body.slice(i));
      if (!d) return 1;
      i += d[0].length;
      return Number(d[0]);
    };
    const counts = group(null);
    if (!counts.size) throw new FormulaError("syntax");
    add(total, counts, coeff);
  }
  return total;
}

export interface MolarMass {
  total: number;
  parts: Array<{ symbol: string; count: number; mass: number; percent: number }>;
}

export function molarMass(formula: string): MolarMass {
  const counts = parseFormula(formula);
  const parts = [...counts].map(([symbol, count]) => ({ symbol, count, mass: element(symbol)!.mass * count, percent: 0 }));
  const total = parts.reduce((s, p) => s + p.mass, 0);
  parts.forEach((p) => (p.percent = (p.mass / total) * 100));
  return { total: Math.round(total * 1000) / 1000, parts };
}

export const CATEGORY_COLOR: Record<string, string> = {
  "Alkali metal": "#ef4444",
  "Alkaline earth metal": "#f97316",
  "Transition metal": "#eab308",
  "Post-transition metal": "#84cc16",
  Metalloid: "#14b8a6",
  Nonmetal: "#3b82f6",
  Halogen: "#8b5cf6",
  "Noble gas": "#d946ef",
  Lanthanide: "#f43f5e",
  Actinide: "#ec4899",
};
