import { describe, it, expect } from "vitest";
import type { Store } from "@tauri-apps/plugin-store";
import { importKey, isSealed, open, seal } from "./vault";
import { personalStore } from "./store";

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const OTHER = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));

/** A fake store plugin file: what lands on disk is in `disk`. */
function fakeStore(disk: Record<string, unknown> = {}) {
  return {
    disk,
    store: {
      get: async (k: string) => (k in disk ? disk[k] : undefined),
      set: async (k: string, v: unknown) => {
        // A slow disk for big values, so out-of-order completion would show.
        await new Promise((r) => setTimeout(r, JSON.stringify(v).length % 7));
        disk[k] = v;
      },
    } as unknown as Store,
  };
}
const settle = () => new Promise((r) => setTimeout(r, 60));

describe("tool data vault", () => {
  it("seals with AES-GCM: nothing readable on disk, and it opens again", async () => {
    const key = await importKey(KEY);
    const s = await seal(key, { notes: ["Exam on Friday"] });
    expect(isSealed(s)).toBe(true);
    expect(JSON.stringify(s)).not.toContain("Exam");
    expect(await open(key, s)).toEqual({ notes: ["Exam on Friday"] });
    // A fresh IV every time.
    expect((await seal(key, 1)).iv).not.toBe((await seal(key, 1)).iv);
    await expect(open(await importKey(OTHER), s)).rejects.toBeTruthy();
  });

  it("writes sealed values, reads them back, and upgrades old plain values", async () => {
    const { disk, store } = fakeStore({ notes: [{ title: "old plain note" }], focusSessions: [{ at: 1, ms: 2 }] });
    const ps = personalStore(store, await importKey(KEY));
    expect(await ps.get("notes")).toEqual([{ title: "old plain note" }]);
    await settle();
    expect(isSealed(disk.notes)).toBe(true); // sealed on the spot
    expect(await ps.get("notes")).toEqual([{ title: "old plain note" }]);
    await ps.set("calc.history", ["6*7 = 42"]);
    expect(isSealed(disk["calc.history"])).toBe(true);
    expect(await ps.get("calc.history")).toEqual(["6*7 = 42"]);
    // Rust writes focusSessions in plain JSON: left alone.
    expect(await ps.get("focusSessions")).toEqual([{ at: 1, ms: 2 }]);
    await settle();
    expect(disk.focusSessions).toEqual([{ at: 1, ms: 2 }]);
  });

  it("never overwrites data it can't open, and keeps writes in order", async () => {
    const key = await importKey(KEY);
    const { disk, store } = fakeStore({ notes: await seal(key, ["secret"]) });
    const noKey = personalStore(store, null);
    expect(await noKey.get("notes")).toBeUndefined();
    await noKey.set("notes", []);
    expect(isSealed(disk.notes)).toBe(true); // the sealed notes survived
    const wrongKey = personalStore(store, await importKey(OTHER));
    expect(await wrongKey.get("notes")).toBeUndefined();
    await wrongKey.set("notes", []);
    expect(await open(key, disk.notes as never)).toEqual(["secret"]);

    const { disk: d2, store: s2 } = fakeStore();
    const ordered = personalStore(s2, key);
    const writes = ["a".repeat(13), "b", "c".repeat(5)];
    await Promise.all(writes.map((w) => ordered.set("x", w)));
    expect(await open(key, d2.x as never)).toBe("c".repeat(5));
  });

  it("a newer write wins over re-sealing an old plain value", async () => {
    const { disk, store } = fakeStore({ notes: ["old"] });
    const ps = personalStore(store, await importKey(KEY));
    await ps.get("notes");
    await ps.set("notes", ["new"]);
    await settle();
    expect(await ps.get("notes")).toEqual(["new"]);
    expect(isSealed(disk.notes)).toBe(true);
  });
});
