import { describe, expect, it } from "vitest";
import { evaluate, STALE_MS, type Policy } from "./policy";

const p = (windows: Policy["windows"], generatedAt = "2026-10-06T05:00:00Z"): Policy => ({
  generatedAt, validUntil: "2026-10-06T22:00:00Z", windows, exam: { active: false, until: null, label: null },
});
const at = (iso: string) => Date.parse(iso);

describe("policy evaluation", () => {
  const day = p([
    { from: "2026-10-06T06:00:00Z", to: "2026-10-06T07:40:00Z", kind: "lesson", label: "Physics", role: "attending" },
    { from: "2026-10-06T08:00:00Z", to: "2026-10-06T09:00:00Z", kind: "lesson", label: "S2 Maths", role: "teaching" },
    { from: "2026-10-06T10:00:00Z", to: "2026-10-06T11:00:00Z", kind: "exam", label: "Maths CAT" },
  ]);

  it("locks during the person's lessons, with the reason and the end", () => {
    expect(evaluate(day, at("2026-10-06T06:30:00Z"))).toEqual({ open: false, reason: "lesson", label: "Physics", until: "2026-10-06T07:40:00Z" });
    expect(evaluate(day, at("2026-10-06T07:45:00Z"))).toEqual({ open: true });
  });

  it("a teacher's own teaching slots count only when asked", () => {
    expect(evaluate(day, at("2026-10-06T08:30:00Z"))).toEqual({ open: true });
    expect(evaluate(day, at("2026-10-06T08:30:00Z"), { lessons: "teaching" })).toMatchObject({ open: false, reason: "lesson" });
  });

  it("exams lock everyone", () => {
    expect(evaluate(day, at("2026-10-06T10:15:00Z"), { lessons: "teaching" })).toMatchObject({ open: false, reason: "exam", label: "Maths CAT" });
  });

  it("fails closed without a fresh policy", () => {
    expect(evaluate(null, at("2026-10-06T06:30:00Z"))).toEqual({ open: false, reason: "stale" });
    expect(evaluate(day, at("2026-10-06T05:00:00Z") + STALE_MS + 1)).toEqual({ open: false, reason: "stale" });
  });
});
