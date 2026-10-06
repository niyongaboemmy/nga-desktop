// Every game speaks EN/FR/RW with the same keys and {placeholders}, and has rules ("help").
import { describe, expect, it } from "vitest";
import { GAMES } from "./catalog";
import { GAME_IDS } from "./types";
import { en } from "../i18n/en";

describe("games catalogue", () => {
  it("lists every game once, matching GAME_IDS (and MIS)", () => {
    expect(GAMES.map((g) => g.id).sort()).toEqual([...GAME_IDS].sort());
    for (const g of GAMES) {
      expect(en, g.id).toHaveProperty(`game.${g.id}`);
      expect(en, g.id).toHaveProperty(`game.${g.id}.desc`);
    }
  });

  it.each(GAMES.map((g) => [g.id, g] as const))("%s has the same strings in every language", async (_id, g) => {
    const { strings, default: C } = await g.load();
    expect(typeof C).toBe("function");
    const keys = Object.keys(strings.en).sort();
    expect(keys).toContain("help");
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const lang of ["fr", "rw"] as const) {
      expect(Object.keys(strings[lang]).sort(), `${g.id} ${lang}`).toEqual(keys);
      for (const k of keys) {
        expect(strings[lang][k], `${g.id} ${lang} ${k}`).toBeTruthy();
        expect(ph(strings[lang][k]), `${g.id} ${lang} ${k}`).toBe(ph(strings.en[k]));
      }
    }
  });
});
