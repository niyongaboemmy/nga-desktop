import { beforeEach, describe, expect, it } from "vitest";
import { nextOverrides, overrideFor, readOverrides, sourceHash, writeOverrides, forgetOverrides } from "./overrides";
import { translator } from "./index";
import { en } from "./en";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  forgetOverrides(null);
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as Storage;
});

describe("published translations", () => {
  it("hash matches MIS (FNV-1a hex)", () => {
    expect(sourceHash("abc")).toBe((440920331).toString(16).padStart(8, "0"));
  });

  it("a published text wins only while it translates the current English", () => {
    const key = "timer.min" as const;
    writeOverrides("fr", { release: 3, strings: { [key]: { t: "{n} minutes (relu)", h: sourceHash(en[key]) } } });
    expect(overrideFor("fr", key, en[key])).toBe("{n} minutes (relu)");
    expect(translator("fr")(key, { n: 5 })).toBe("5 minutes (relu)");
    // English changed after the translation: the bundled text is used.
    expect(overrideFor("fr", key, "{n} min left")).toBeNull();
    writeOverrides("fr", { release: 4, strings: { [key]: { t: "stale", h: "deadbeef" } } });
    expect(translator("fr")(key, { n: 5 })).not.toBe("stale");
    // English is never overridden.
    expect(translator("en")(key, { n: 5 })).toBe("5 min");
  });

  it("caches per language and survives a broken cache", () => {
    store.set("nga.tools.i18n.rw", "{not json");
    expect(readOverrides("rw")).toBeNull();
    writeOverrides("rw", { release: 1, strings: {} });
    forgetOverrides("nga.tools.i18n.rw");
    expect(readOverrides("rw")?.release).toBe(1);
  });

  it("merges server answers", () => {
    expect(nextOverrides(null, { release: 0, strings: {} })).toEqual({ release: 0, strings: {} });
    expect(nextOverrides({ release: 2, strings: {} }, { release: 2, unchanged: true })).toBeNull();
    expect(nextOverrides({ release: 2, strings: {} }, { release: 2, strings: {} })).toBeNull();
    expect(nextOverrides({ release: 2, strings: {} }, { release: 5, strings: { a: { t: "x", h: "1" } } })?.release).toBe(5);
  });
});
