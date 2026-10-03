import { describe, expect, it } from "vitest";
import { isSlow, reduce, SLOW_MS, type Views } from "./appState";

describe("app view state", () => {
  it("first open starts, first load makes it ready", () => {
    let v: Views = {};
    v = reduce(v, { type: "opened", key: "tupo", at: 1 });
    expect(v.tupo?.status).toBe("starting");
    v = reduce(v, { type: "loading", key: "tupo", url: "https://mis.amashuri.com/login" });
    expect(v.tupo?.busy).toBe(false);
    v = reduce(v, { type: "loaded", key: "tupo", url: "https://tupo.amashuri.com/app" });
    expect(v.tupo).toMatchObject({ status: "ready", busy: false, url: "https://tupo.amashuri.com/app" });
  });

  it("navigation inside a ready app is a busy bar, not a splash", () => {
    let v: Views = reduce({}, { type: "loaded", key: "mis" });
    v = reduce(v, { type: "loading", key: "mis" });
    expect(v.mis).toMatchObject({ status: "ready", busy: true });
    v = reduce(v, { type: "opened", key: "mis", at: 5 });
    expect(v.mis?.status).toBe("ready");
  });

  it("is slow only while starting past the threshold", () => {
    const v = reduce({}, { type: "opened", key: "tendo", at: 0 });
    expect(isSlow(v.tendo, SLOW_MS - 1)).toBe(false);
    expect(isSlow(v.tendo, SLOW_MS)).toBe(true);
    expect(isSlow(reduce(v, { type: "loaded", key: "tendo" }).tendo, SLOW_MS * 2)).toBe(false);
  });

  it("sign-out forgets every app", () => {
    expect(reduce(reduce({}, { type: "loaded", key: "mis" }), { type: "reset" })).toEqual({});
  });
});
