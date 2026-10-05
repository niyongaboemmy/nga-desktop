import { describe, expect, it } from "vitest";
import { dictionaries, detectLang, translator } from "./index";
import { en } from "./en";

describe("tools i18n", () => {
  it("every language has every key, none empty", () => {
    for (const [lang, d] of Object.entries(dictionaries)) {
      for (const k of Object.keys(en)) expect((d as Record<string, string>)[k], `${lang}: ${k}`).toBeTruthy();
      expect(Object.keys(d).sort(), lang).toEqual(Object.keys(en).sort());
    }
  });

  it("keeps the same {placeholders} as English", () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const [lang, d] of Object.entries(dictionaries))
      for (const [k, v] of Object.entries(en)) expect(ph((d as Record<string, string>)[k]), `${lang}: ${k}`).toBe(ph(v));
  });

  it("fills placeholders", () => {
    expect(translator("en")("timer.min", { n: 5 })).toBe("5 min");
    expect(translator("rw")("timer.min", { n: 5 })).toBe("Iminota 5");
  });

  it("detects the computer's language", () => {
    expect(detectLang(["fr-FR", "en"])).toBe("fr");
    expect(detectLang(["rw-RW"])).toBe("rw");
    expect(detectLang(["sw-KE", "de"])).toBe("en");
    expect(detectLang([])).toBe("en");
  });
});
