// The calculator's engine: mathjs in a locked-down instance (no import, no
// parse/evaluate from inside an expression; see mathjs "security"), with
// school-calculator conventions on top:
//   log = base 10, ln = natural log, × ÷ − π √ accepted, nCr / nPr,
//   DEG or RAD for trigonometry, Ans = the last result, units ("5 km to m").
// BigNumber arithmetic, so 0.1 + 0.2 shows 0.3.
import { all, create, type MathJsInstance } from "mathjs";

export type AngleMode = "deg" | "rad";

export type CalcResult =
  | { ok: true; text: string; fraction: string | null; value: unknown }
  | { ok: false; error: "empty" | "syntax" | "unknown" | "infinite" | "other"; detail?: string };

interface Engine {
  math: MathJsInstance;
  /** The real evaluate, kept before expressions lose access to it. */
  run: MathJsInstance["evaluate"];
}

const instances: Partial<Record<AngleMode, Engine>> = {};

function build(mode: AngleMode): Engine {
  const math = create(all, { number: "BigNumber", precision: 64 });
  if (mode === "deg") {
    const toRad = (x: unknown) => math.multiply(x as never, math.divide(math.pi, 180) as never);
    const toDeg = (x: unknown) => math.multiply(x as never, math.divide(180, math.pi) as never);
    const isUnit = (x: unknown) => math.isUnit(x);
    const { sin, cos, tan, sec, csc, cot, asin, acos, atan, atan2 } = math;
    math.import(
      {
        sin: (x: never) => (isUnit(x) ? sin(x) : sin(toRad(x) as never)),
        cos: (x: never) => (isUnit(x) ? cos(x) : cos(toRad(x) as never)),
        tan: (x: never) => (isUnit(x) ? tan(x) : tan(toRad(x) as never)),
        sec: (x: never) => (isUnit(x) ? sec(x) : sec(toRad(x) as never)),
        csc: (x: never) => (isUnit(x) ? csc(x) : csc(toRad(x) as never)),
        cot: (x: never) => (isUnit(x) ? cot(x) : cot(toRad(x) as never)),
        asin: (x: never) => toDeg(asin(x)),
        acos: (x: never) => toDeg(acos(x)),
        atan: (x: never) => toDeg(atan(x)),
        atan2: (y: never, x: never) => toDeg(atan2(y, x)),
      },
      { override: true },
    );
  }
  const run = math.evaluate;
  const blocked = (name: string) => () => {
    throw new Error(`Function ${name} is not available`);
  };
  math.import(
    {
      import: blocked("import"),
      createUnit: blocked("createUnit"),
      evaluate: blocked("evaluate"),
      parse: blocked("parse"),
      simplify: blocked("simplify"),
      derivative: blocked("derivative"),
      resolve: blocked("resolve"),
      reviver: blocked("reviver"),
    },
    { override: true },
  );
  return { math, run };
}

const engine = (mode: AngleMode) => (instances[mode] ??= build(mode));

/** Calculator spellings → mathjs. Exported for tests. */
export function normalise(expr: string): string {
  return expr
    .replace(/[×✕]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/π/g, "pi")
    .replace(/√\s*\(/g, "sqrt(")
    .replace(/√\s*([\d.]+)/g, "sqrt($1)")
    .replace(/\bAns\b/gi, "ans")
    .replace(/(\d+)\s*nCr\s*(\d+)/g, "combinations($1, $2)")
    .replace(/(\d+)\s*nPr\s*(\d+)/g, "permutations($1, $2)")
    .replace(/\bln\s*\(/g, "__ln__(")
    .replace(/\blog\s*\(/g, "log10(")
    .replace(/__ln__\(/g, "log(")
    .replace(/,(?=\d{3}\b)/g, "") // 1,000,000 → 1000000 (thousands separators)
    .trim();
}

const FORMAT = { notation: "auto", precision: 14, lowerExp: -9, upperExp: 15 } as const;

export function evaluate(expr: string, mode: AngleMode = "deg", ans?: unknown): CalcResult {
  const src = normalise(expr);
  if (!src) return { ok: false, error: "empty" };
  const { math, run } = engine(mode);
  try {
    const scope = new Map<string, unknown>([["ans", ans ?? math.bignumber(0)]]);
    let value = run(src, scope) as unknown;
    if (value && typeof value === "object" && "entries" in (value as object) && Array.isArray((value as { entries: unknown[] }).entries)) {
      // "a = 2; a * 3" gives a ResultSet: show the last one.
      const entries = (value as { entries: unknown[] }).entries;
      value = entries[entries.length - 1];
    }
    if (value === undefined || typeof value === "function") return { ok: false, error: "syntax" };
    if (math.isBigNumber(value) && !(value as { isFinite(): boolean }).isFinite()) return { ok: false, error: "infinite" };
    if (typeof value === "number" && !Number.isFinite(value)) return { ok: false, error: "infinite" };
    const text = math.format(value as never, FORMAT);
    return { ok: true, text: tidy(text), fraction: asFraction(math, value), value };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Undefined symbol|Undefined function|Unknown function|is not available/i.test(msg)) {
      const m = /(?:symbol|function)\s+([\w.]+)/i.exec(msg);
      return { ok: false, error: "unknown", detail: m?.[1] };
    }
    if (/Unexpected|Parenthesis|Value expected|Syntax|Char|end of expression|Unexpected operator/i.test(msg))
      return { ok: false, error: "syntax" };
    return { ok: false, error: "other", detail: msg };
  }
}

/** "1.5000" → "1.5"; keeps exponents and units. */
function tidy(text: string): string {
  return text.replace(/^(-?\d+\.\d*?)0+(?=$|e|\s)/, "$1").replace(/\.(?=$|e|\s)/, "");
}

/** A short exact fraction for non-integers ("1/3"), when there is one. */
function asFraction(math: MathJsInstance, value: unknown): string | null {
  if (!math.isBigNumber(value)) return null;
  const n = math.number(value as never) as number;
  if (!Number.isFinite(n) || Number.isInteger(n) || Math.abs(n) > 1e9) return null;
  try {
    const f = math.fraction(n) as unknown as { s: bigint | number; n: bigint | number; d: bigint | number };
    const d = Number(f.d);
    if (d > 1000) return null;
    const num = Number(f.n) * Number(f.s);
    if (Math.abs(num / d - n) > 1e-12) return null;
    const whole = Math.trunc(num / d);
    return whole !== 0 && Math.abs(num) > d ? `${num}/${d} = ${whole} ${Math.abs(num % d)}/${d}` : `${num}/${d}`;
  } catch {
    return null;
  }
}

/** For M+ / M−: add two results (BigNumbers) safely. */
export function addValues(a: unknown, b: unknown, sign: 1 | -1 = 1): unknown {
  const { math } = engine("rad");
  try {
    return sign === 1 ? math.add(a as never, b as never) : math.subtract(a as never, b as never);
  } catch {
    return a;
  }
}

export function zero(): unknown {
  return engine("rad").math.bignumber(0);
}

export function formatValue(v: unknown): string {
  try {
    return tidy(engine("rad").math.format(v as never, FORMAT));
  } catch {
    return String(v);
  }
}
