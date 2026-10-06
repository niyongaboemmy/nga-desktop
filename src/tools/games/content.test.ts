// Word content is for a school: right shape, no duplicates, nothing offensive (plan §6.10).
import { describe, expect, it } from "vitest";
import { ANSWERS } from "./five-letter/words";
import { PACKS } from "./word-search/packs";
import { SETS } from "./pairs/sets";

// Kept short and generic on purpose; extend when reviewers report a word.
const BLOCK = [
  "sex", "porn", "nude", "naked", "fuck", "shit", "bitch", "whore", "slut", "rape", "kill", "drug", "weed", "dick", "penis", "vagina", "boob", "booze", "nazi", "racist",
  "merde", "pute", "salope", "connard", "conne", "bite", "chier", "drogue", "nazis", "viol",
  "ubusambanyi", "indaya", "igitsina", "kwica", "urumogi",
];
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Whole words only: "grape" or "fichier" must not trip on a fragment.
const clean = (word: string) => !BLOCK.includes(plain(word));

describe("games word content", () => {
  it("five-letter answers: five plain letters, no duplicates, nothing offensive", () => {
    for (const [lang, list] of Object.entries(ANSWERS)) {
      expect(list.length, lang).toBeGreaterThanOrEqual(lang === "rw" ? 60 : 100);
      expect(new Set(list).size, `${lang} duplicates`).toBe(list.length);
      for (const w of list) {
        expect(w, `${lang}: ${w}`).toMatch(/^[a-z]{5}$/);
        expect(clean(w), `${lang}: ${w}`).toBe(true);
      }
    }
  });

  it("word-search packs and pair sets are clean", () => {
    const words = [
      ...PACKS.flatMap((p) => Object.values(p.words).flat() as string[]),
      ...Object.values(SETS).flatMap((s) => s.flatMap((it) => [it.a, it.b].map((l) => (typeof l === "string" ? l : Object.values(l).join(" "))))),
    ];
    expect(words.length).toBeGreaterThan(100);
    for (const w of words) for (const part of w.split(/[\s'’-]+/)) expect(clean(part), w).toBe(true);
  });
});
