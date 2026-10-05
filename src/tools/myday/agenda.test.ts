import { describe, expect, it } from "vitest";
import { byDay, hhmm, kigaliDay, linkTarget, nowNext, until, type AgendaItem } from "./agenda";

const item = (start: string, end: string | null, title = "x", kind = "lesson"): AgendaItem => ({
  key: `${kind}:${start}`, kind, title, detail: null, location: null, link: null, color: null, role: "attending", critical: false, start, end,
});

describe("My Day agenda", () => {
  it("uses Kigali days and times (UTC+2), whatever the computer's zone", () => {
    expect(kigaliDay("2026-10-06T22:30:00Z")).toBe("2026-10-07");
    expect(hhmm("2026-10-06T06:00:00Z")).toBe("08:00");
  });

  it("groups by day in order", () => {
    const g = byDay([item("2026-10-07T06:00:00Z", null), item("2026-10-06T08:00:00Z", null), item("2026-10-06T06:00:00Z", null)]);
    expect([...g.keys()]).toEqual(["2026-10-06", "2026-10-07"]);
    expect(g.get("2026-10-06")!.map((i) => i.start)).toEqual(["2026-10-06T06:00:00Z", "2026-10-06T08:00:00Z"]);
  });

  it("finds now and next (today only)", () => {
    const items = [
      item("2026-10-06T06:00:00Z", "2026-10-06T07:40:00Z", "Physics"),
      item("2026-10-06T08:00:00Z", "2026-10-06T09:00:00Z", "Maths"),
      item("2026-10-07T06:00:00Z", "2026-10-07T07:00:00Z", "Tomorrow"),
    ];
    const at = (iso: string) => Date.parse(iso);
    expect(nowNext(items, at("2026-10-06T06:30:00Z"))).toMatchObject({ current: { title: "Physics" }, next: { title: "Maths" } });
    expect(nowNext(items, at("2026-10-06T07:50:00Z"))).toMatchObject({ current: null, next: { title: "Maths" } });
    expect(nowNext(items, at("2026-10-06T09:30:00Z"))).toEqual({ current: null, next: null });
  });

  it("counts down in hours and minutes, rounding up", () => {
    expect(until(8 * 60_000 - 1)).toEqual({ h: 0, m: 8 });
    expect(until(65 * 60_000)).toEqual({ h: 1, m: 5 });
    expect(until(-5)).toEqual({ h: 0, m: 0 });
  });

  it("opens links in the right NGA app", () => {
    const apps = [{ key: "mis" as const, origin: "https://mis.amashuri.com" }, { key: "taskmentor" as const, origin: "https://taskmentor.amashuri.com" }];
    expect(linkTarget("/my-office-hours", apps)).toEqual({ key: "mis", path: "/my-office-hours" });
    expect(linkTarget("https://taskmentor.amashuri.com/quizzes/12?x=1", apps)).toEqual({ key: "taskmentor", path: "/quizzes/12?x=1" });
    expect(linkTarget("https://evil.example/x", apps)).toBeNull();
    expect(linkTarget(null, apps)).toBeNull();
  });
});
