import { describe, expect, it } from "vitest";
import { gridKey, lineCells, mark, newGame, spell, WORDS_PER, type Size, type State } from "./logic";
import { PACKS, packsFor } from "./packs";
import type { Lang } from "../../i18n";

const LANGS: Lang[] = ["en", "fr", "rw"];

/** Words that must never appear in a school game (EN/FR/RW). Short ones match exactly, long ones anywhere. */
const BLOCKED = [
  "fuck", "shit", "bitch", "ass", "dick", "cock", "cunt", "slut", "whore", "sex", "sexy", "porn", "nigger", "fag", "rape", "drugs", "bastard", "penis", "vagina", "boobs",
  "merde", "putain", "pute", "con", "conne", "salope", "connard", "bite", "cul", "encule", "nique", "bordel",
  "indaya", "igituba", "imboro", "inzoga", "ubusambanyi", "gusambana",
];
const offensive = (w: string) => {
  const x = gridKey(w).toLowerCase();
  return BLOCKED.some((b) => (b.length >= 5 ? x.includes(b) : x === b));
};

const findAll = (s: State) => s.words.reduce((acc, w) => {
  const n = w.key.length - 1;
  return mark(acc, w.r, w.c, w.r + w.dr * n, w.c + w.dc * n);
}, s);

describe("word search: packs", () => {
  it("has 6 English packs of 12+ words and 3+ French and Kinyarwanda packs of 10+", () => {
    expect(packsFor("en").length).toBeGreaterThanOrEqual(6);
    for (const p of packsFor("en")) expect(p.words.en!.length, p.id).toBeGreaterThanOrEqual(12);
    for (const lang of ["fr", "rw"] as const) {
      expect(packsFor(lang).length, lang).toBeGreaterThanOrEqual(3);
      for (const p of packsFor(lang)) expect(p.words[lang]!.length, `${lang} ${p.id}`).toBeGreaterThanOrEqual(10);
    }
  });

  it("names every pack in each of its languages, words fit and are unique", () => {
    for (const p of PACKS) {
      for (const [lang, list] of Object.entries(p.words)) {
        expect(p.name[lang as Lang], `${p.id} ${lang}`).toBeTruthy();
        const keys = list!.map(gridKey);
        for (const k of keys) expect(k.length, k).toBeGreaterThanOrEqual(2);
        for (const k of keys) expect(k.length, k).toBeLessThanOrEqual(10);
        expect(new Set(keys).size, `${p.id} ${lang}`).toBe(keys.length);
      }
    }
  });

  it("holds nothing offensive", () => {
    for (const p of PACKS) for (const list of Object.values(p.words)) for (const w of list!) expect(offensive(w), w).toBe(false);
    expect(offensive("Merde")).toBe(true);
  });
});

describe("word search: grid", () => {
  it("strips accents for the grid", () => {
    expect(gridKey("Molécule")).toBe("MOLECULE");
    expect(gridKey("forêt")).toBe("FORET");
  });

  it("places every word, readable from the grid, for every pack, size and many seeds", () => {
    for (const lang of LANGS) for (const p of packsFor(lang)) for (const size of [10, 12] as Size[]) for (let seed = 0; seed < 25; seed++) {
      const s = newGame(lang, p.id, size, seed * 7919 + 1);
      const label = `${lang} ${p.id} ${size} ${seed}`;
      expect(s.grid, label).toMatch(new RegExp(`^[A-Z]{${size * size}}$`));
      expect(s.words.length, label).toBe(Math.min(WORDS_PER[size], p.words[lang]!.length));
      for (const w of s.words) {
        const n = w.key.length - 1;
        expect(spell(s.grid, size, w.r, w.c, w.r + w.dr * n, w.c + w.dc * n), `${label} ${w.word}`).toBe(w.key);
      }
    }
  });

  it("uses all 8 directions across games", () => {
    const dirs = new Set<string>();
    for (let seed = 0; seed < 30; seed++) for (const w of newGame("en", "geography", 10, seed).words) dirs.add(`${w.dr},${w.dc}`);
    expect(dirs.size).toBe(8);
  });

  it("is the same grid for the same seed", () => {
    expect(newGame("fr", "physics", 12, 5)).toEqual(newGame("fr", "physics", 12, 5));
    expect(newGame("en", "physics", 10, 5).grid).not.toBe(newGame("en", "physics", 10, 6).grid);
  });

  it("falls back to a pack that exists in the language", () => {
    expect(newGame("rw", "chemistry", 10, 1).pack).not.toBe("chemistry");
  });
});

describe("word search: play", () => {
  it("finds a word marked either way round, once", () => {
    const s = newGame("en", "biology", 10, 3);
    const w = s.words[0];
    const n = w.key.length - 1;
    const end = [w.r + w.dr * n, w.c + w.dc * n] as const;
    const a = mark(s, end[0], end[1], w.r, w.c);
    expect(a.found[0]).toEqual([end[0], end[1], w.r, w.c]);
    expect(mark(a, w.r, w.c, end[0], end[1])).toBe(a);
  });

  it("ignores lines that are not straight or not a word", () => {
    const s = newGame("en", "maths", 10, 4);
    expect(mark(s, 0, 0, 1, 2)).toBe(s);
    expect(lineCells(10, 0, 0, 1, 2)).toEqual([]);
    expect(lineCells(10, 2, 2, 0, 0)).toEqual([22, 11, 0]);
    expect(mark(s, 0, 0, 0, 0)).toBe(s);
  });

  it("ends when every word is found", () => {
    const done = findAll(newGame("rw", "maths", 12, 8));
    expect(done.over).toBe(true);
    expect(done.found.every(Boolean)).toBe(true);
    expect(mark(done, 0, 0, 0, 3)).toBe(done);
  });

  it("restores exactly from a saved (JSON) state", () => {
    const s = newGame("fr", "geography", 10, 21);
    const w = s.words[1];
    const n = w.key.length - 1;
    const a = mark(s, w.r, w.c, w.r + w.dr * n, w.c + w.dc * n);
    const b: State = JSON.parse(JSON.stringify(a));
    expect(b).toEqual(a);
    expect(findAll(b)).toEqual(findAll(a));
  });
});
