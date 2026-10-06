// The graphing calculator's maths (pure, unit-tested): compile, sample, zeros, ticks.
import { all, create } from "mathjs";

const math = create(all, { number: "number" });
const run = math.evaluate;
const compileExpr = math.compile;
math.import(
  Object.fromEntries(["import", "createUnit", "evaluate", "parse", "simplify", "derivative", "resolve"].map((n) => [n, () => { throw new Error(`${n} is not available`); }])),
  { override: true },
);
void run;

export type Fn = (x: number) => number;

/** "y = 2x^2 - 3", "f(x)=sin(x)", "x^2" → a function of x (and parameters), or an error. */
export function compileFunction(expr: string, params: Record<string, number> = {}): { fn: Fn } | { error: string } {
  const src = expr.replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=\s*/i, "").replace(/π/g, "pi").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").trim();
  if (!src) return { error: "empty" };
  try {
    const code = compileExpr(src);
    const fn: Fn = (x) => {
      const v = code.evaluate({ ...params, x });
      return typeof v === "number" ? v : NaN;
    };
    fn(0.5);
    return { fn };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Letters other than x used as parameters ("a*x+b" → ["a","b"]). */
export function parametersOf(expr: string): string[] {
  const reserved = new Set(["x", "y", "e", "pi", "f", "i"]);
  const names = new Set<string>();
  for (const m of expr.replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=/i, "").matchAll(/\b([a-zA-Z])\b(?!\s*\()/g)) if (!reserved.has(m[1])) names.add(m[1]);
  return [...names].sort();
}

/**
 * Sample f over [x0, x1] into polyline segments. A segment breaks where f is not
 * finite or jumps by more than `jump` (vertical asymptotes, e.g. tan x, 1/x).
 */
export function sample(fn: Fn, x0: number, x1: number, n: number, jump: number): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> = [];
  let prev: number | null = null;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    let y: number;
    try { y = fn(x); } catch { y = NaN; }
    if (!Number.isFinite(y) || (prev !== null && Math.abs(y - prev) > jump)) {
      if (cur.length > 1) out.push(cur);
      cur = [];
      prev = Number.isFinite(y) ? y : null;
      if (Number.isFinite(y)) cur.push([x, y]);
      continue;
    }
    cur.push([x, y]);
    prev = y;
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Roots of f in [x0, x1]: sign changes refined by bisection (skips asymptotes). */
export function zeros(fn: Fn, x0: number, x1: number, n = 800): number[] {
  const out: number[] = [];
  let px = x0, py = fn(x0);
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = fn(x);
    if (Number.isFinite(py) && Number.isFinite(y)) {
      if (py === 0) out.push(px);
      else if (py * y < 0) {
        let a = px, b = x, fa = py;
        for (let k = 0; k < 60; k++) {
          const m = (a + b) / 2, fm = fn(m);
          if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
        }
        const r = (a + b) / 2;
        // A real root, not a jump across an asymptote.
        if (Math.abs(fn(r)) < 1e-6 * Math.max(1, Math.abs(py), Math.abs(y))) out.push(r);
      }
    }
    px = x;
    py = y;
  }
  return out.map((r) => Math.round(r * 1e9) / 1e9).filter((r, i, a) => i === 0 || Math.abs(r - a[i - 1]) > 1e-6);
}

/** x-values where f = g. */
export const intersections = (f: Fn, g: Fn, x0: number, x1: number) => zeros((x) => f(x) - g(x), x0, x1);

/** A "nice" grid step (1, 2 or 5 × 10^n) giving about `target` lines over `span`. */
export function niceStep(span: number, target = 10): number {
  const raw = span / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

export const fmtNum = (v: number) => (Math.abs(v) < 1e-12 ? "0" : String(Number(v.toPrecision(6))));
