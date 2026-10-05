import { describe, expect, it } from "vitest";
import { errorFrom, parseLines } from "./api";

describe("MIS API helpers", () => {
  it("parses NDJSON, skipping blanks and broken lines", () => {
    expect(parseLines('{"t":"a"}\n\n{"t":"b"}\nnot json\n{"done":true}')).toEqual([{ t: "a" }, { t: "b" }, { done: true }]);
  });

  it("turns error bodies into readable errors", () => {
    const e = errorFrom(429, JSON.stringify({ success: false, code: "DAILY_LIMIT", message: "You've used today's 40 messages." }));
    expect([e.status, e.code, e.message]).toEqual([429, "DAILY_LIMIT", "You've used today's 40 messages."]);
    expect(errorFrom(401, "<html>").message).toBe("Sign in to NGA MIS again");
  });
});
