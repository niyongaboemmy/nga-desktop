// Unit conversion (offline), on mathjs units in plain-number mode.
import { all, create } from "mathjs";
import type { Key } from "../i18n";

const math = create(all, { number: "number" });

export interface UnitDef {
  /** mathjs unit name */
  id: string;
  /** Shown to people */
  label: string;
}

export interface Category {
  id: string;
  title: Key;
  units: UnitDef[];
}

const u = (id: string, label = id): UnitDef => ({ id, label });

export const CATEGORIES: Category[] = [
  { id: "length", title: "conv.length", units: [u("mm"), u("cm"), u("m"), u("km"), u("inch", "in"), u("ft"), u("yd"), u("mi")] },
  { id: "mass", title: "conv.mass", units: [u("mg"), u("g"), u("kg"), u("tonne", "t"), u("lb"), u("oz")] },
  { id: "temperature", title: "conv.temperature", units: [u("degC", "°C"), u("degF", "°F"), u("K")] },
  { id: "area", title: "conv.area", units: [u("mm2", "mm²"), u("cm2", "cm²"), u("m2", "m²"), u("hectare", "ha"), u("km2", "km²"), u("acre"), u("sqft", "ft²")] },
  { id: "volume", title: "conv.volume", units: [u("mL"), u("L"), u("cm3", "cm³"), u("m3", "m³"), u("gal", "gal (US)"), u("cup")] },
  { id: "speed", title: "conv.speed", units: [u("m/s"), u("km/h"), u("mi/h", "mph"), u("ft/s")] },
  { id: "time", title: "conv.time", units: [u("ms"), u("s"), u("minute", "min"), u("hour", "h"), u("day"), u("week"), u("year")] },
  { id: "energy", title: "conv.energy", units: [u("J"), u("kJ"), u("Wh"), u("kWh"), u("eV"), u("BTU")] },
  { id: "power", title: "conv.power", units: [u("W"), u("kW"), u("hp")] },
  { id: "pressure", title: "conv.pressure", units: [u("Pa"), u("kPa"), u("bar"), u("atm"), u("psi"), u("mmHg")] },
  { id: "angle", title: "conv.angle", units: [u("deg", "°"), u("rad"), u("grad")] },
  { id: "data", title: "conv.data", units: [u("b", "bit"), u("B", "byte"), u("kB"), u("MB"), u("GB"), u("TB"), u("KiB"), u("MiB"), u("GiB")] },
];

/** value in `from` → `to`, or null when it can't be converted. */
export function convert(value: number, from: string, to: string): number | null {
  if (!Number.isFinite(value)) return null;
  try {
    const r = math.unit(value, from).toNumber(to);
    return Number.isFinite(r) ? r : null;
  } catch {
    return null;
  }
}

/** 10 significant digits, no float noise ("0.30000000000000004" → "0.3"). */
export function show(n: number | null): string {
  if (n === null) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e15 || abs < 1e-9) return n.toExponential(6).replace(/\.?0+e/, "e");
  return String(Number(n.toPrecision(10)));
}

/** Parse what people type: "1,5" (French comma), "1 000", "2.5e3". */
export function parseNumber(text: string): number | null {
  const raw = text.trim().replace(/\s+/g, "");
  // "1,000,000" / "1,000.5": thousands separators. Otherwise "1,5": a decimal comma (French).
  const t = /^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(/,(?=\d+$)/, ".");
  if (!t || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
