import { describe, expect, it } from "vitest";
import { clock, elapsed, parseLength, progress, remaining } from "./format";

describe("timer format", () => {
  it("shows clocks", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(65_000)).toBe("1:05");
    expect(clock(3_725_000)).toBe("1:02:05");
    expect(clock(1_500, false, true)).toBe("0:01.5");
    expect(clock(-5)).toBe("0:00");
  });

  it("counting down rounds up so zero is shown only at the end", () => {
    expect(clock(59_001, true)).toBe("1:00");
    expect(clock(1, true)).toBe("0:01");
    expect(clock(0, true)).toBe("0:00");
  });

  it("reads lengths the way people type them", () => {
    expect(parseLength("5")).toBe(300_000);
    expect(parseLength("2.5")).toBe(150_000);
    expect(parseLength("4:30")).toBe(270_000);
    expect(parseLength("1:00:00")).toBe(3_600_000);
    expect(parseLength("90s")).toBe(90_000);
    expect(parseLength("1h 30m")).toBe(5_400_000);
    expect(parseLength("10 min")).toBe(600_000);
    expect(parseLength("4:75")).toBeNull();
    expect(parseLength("soon")).toBeNull();
    expect(parseLength("")).toBeNull();
  });

  it("computes progress from the native timer", () => {
    const t = { durationMs: 60_000, elapsedMs: 10_000, runningSince: 1_000 };
    expect(elapsed(t, 21_000)).toBe(30_000);
    expect(remaining(t, 21_000)).toBe(30_000);
    expect(progress(t, 21_000)).toBe(0.5);
    expect(remaining(t, 999_999)).toBe(0);
    expect(progress({ ...t, runningSince: null }, 999_999)).toBeCloseTo(1 / 6);
  });
});
