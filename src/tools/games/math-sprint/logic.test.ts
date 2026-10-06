import { describe, expect, it } from "vitest";
import { answer, LEVELS, newRound, parseAnswer, question, ROUND_MS, start, tick, type Level, type State } from "./logic";

/** Work out a question's text independently, to check the generator's answers. */
function solve(text: string): number {
  const t = text.replace(/−/g, "-").replace(/\{of\}/, "of");
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(-?\d+)x ([+-]) (\d+) = (-?\d+)\s+x = \?$/))) {
    const a = +m[1], b = (m[2] === "+" ? 1 : -1) * +m[3], c = +m[4];
    return (c - b) / a;
  }
  if ((m = t.match(/^log ([\d.]+)$/))) return Math.round(Math.log10(+m[1]));
  if ((m = t.match(/^(\d+)% of (\d+)$/))) return (+m[1] * +m[2]) / 100;
  if ((m = t.match(/^√(\d+)$/))) return Math.sqrt(+m[1]);
  const supDigits: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
  const js = t
    .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (s) => `**${s.split("").map((c) => supDigits[c]).join("")}`)
    .replace(/×/g, "*").replace(/÷/g, "/");
  return Function(`return (${js});`)() as number;
}

describe("math sprint", () => {
  it.each(LEVELS.map((l) => [l]))("level S%i gives correct whole answers", (level) => {
    let r = 1000 + level;
    for (let i = 0; i < 400; i++) {
      const [q, next] = question(level as Level, r);
      r = next;
      expect(Number.isInteger(q.answer), q.text).toBe(true);
      expect(solve(q.text) + 0, q.text).toBe(q.answer);
    }
  });

  it("keeps S1–S2 answers non-negative and uses negatives later", () => {
    const answers = (level: Level) => {
      let r = 5;
      return Array.from({ length: 300 }, () => {
        const [q, n] = question(level, r);
        r = n;
        return q;
      });
    };
    expect(answers(1).every((q) => q.answer >= 0)).toBe(true);
    expect(answers(2).every((q) => q.answer >= 0)).toBe(true);
    expect(answers(3).some((q) => q.answer < 0)).toBe(true);
    expect(answers(6).some((q) => q.text.startsWith("log"))).toBe(true);
    expect(answers(5).some((q) => q.text.includes("x = ?"))).toBe(true);
  });

  it("scores right answers and moves on after a wrong one", () => {
    let s = start(newRound(1, 77));
    const q1 = s.q;
    s = answer(s, String(q1.answer));
    expect(s.score).toBe(1);
    expect(s.last).toMatchObject({ ok: true, answer: q1.answer });
    const q2 = s.q;
    s = answer(s, String(q2.answer + 1));
    expect(s.score).toBe(1);
    expect(s.answered).toBe(2);
    expect(s.last).toMatchObject({ ok: false, answer: q2.answer, text: q2.text });
  });

  it("ignores empty or non-number input and answers before the start", () => {
    const ready = newRound(3, 1);
    expect(answer(ready, "4")).toBe(ready);
    const s = start(ready);
    expect(answer(s, "")).toBe(s);
    expect(answer(s, "abc")).toBe(s);
    expect(parseAnswer("−12")).toBe(-12);
    expect(parseAnswer(" 7 ")).toBe(7);
    expect(parseAnswer("2,5")).toBe(2.5);
  });

  it("ends when the 60 seconds are used, and only counts running time", () => {
    let s = newRound(2, 3);
    expect(tick(s, 5000)).toBe(s);
    s = start(s);
    s = tick(s, 59_000);
    expect(s.left).toBe(ROUND_MS - 59_000);
    expect(s.phase).toBe("run");
    s = tick(s, 2000);
    expect(s.left).toBe(0);
    expect(s.phase).toBe("over");
    expect(answer(s, String(s.q.answer))).toBe(s);
  });

  it("replays exactly from a saved (JSON) state", () => {
    let a: State = start(newRound(5, 99));
    a = answer(answer(a, "1"), "2");
    let b: State = JSON.parse(JSON.stringify(a));
    for (const x of ["3", "4", "5"]) {
      a = answer(a, x);
      b = answer(b, x);
    }
    expect(b).toEqual(a);
    expect(newRound(4, 12)).toEqual(newRound(4, 12));
  });
});
