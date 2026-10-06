import { describe, expect, it } from "vitest";
import { answerFor, erase, letterStates, marks, newGame, normalise, submit, typeLetter, type State } from "./logic";
import { ANSWERS } from "./words";

const play = (s: State, word: string): State => submit([...word].reduce(typeLetter, s));

/** Words that must never appear in a school game (EN/FR/RW). Short ones match exactly, long ones anywhere. */
const BLOCKED = [
  "fuck", "shit", "bitch", "ass", "dick", "cock", "cunt", "slut", "whore", "sex", "sexy", "porn", "nigger", "fag", "rape", "drugs", "bastard", "penis", "vagina", "boobs",
  "merde", "putain", "pute", "con", "conne", "salope", "connard", "bite", "cul", "encule", "nique", "bordel",
  "indaya", "igituba", "imboro", "inzoga", "ubusambanyi", "gusambana",
];
const offensive = (w: string) => {
  const x = normalise(w);
  return BLOCKED.some((b) => (b.length >= 5 ? x.includes(b) : x === b));
};

describe("five letters: word lists", () => {
  it.each(Object.entries(ANSWERS))("%s answers are five plain letters, unique", (_lang, list) => {
    for (const w of list) expect(w, w).toMatch(/^[a-z]{5}$/);
    expect(new Set(list).size).toBe(list.length);
  });

  it("has enough words in each language", () => {
    expect(ANSWERS.en.length).toBeGreaterThanOrEqual(150);
    expect(ANSWERS.fr.length).toBeGreaterThanOrEqual(100);
    expect(ANSWERS.rw.length).toBeGreaterThanOrEqual(60);
  });

  it("holds nothing offensive", () => {
    for (const list of Object.values(ANSWERS)) for (const w of list) expect(offensive(w), w).toBe(false);
    expect(offensive("Merde")).toBe(true); // the check itself works
  });
});

describe("five letters: marks", () => {
  it("marks right place, wrong place and absent letters", () => {
    expect(marks("crane", "cards")).toEqual(["hit", "near", "near", "miss", "miss"]);
    expect(marks("table", "table")).toEqual(Array(5).fill("hit"));
  });

  it("handles repeated letters in the guess", () => {
    // Only one E in the answer: the exact one wins, the other is a miss.
    expect(marks("geese", "those")).toEqual(["miss", "miss", "miss", "hit", "hit"]);
    // One L and one A in the answer, each guessed twice, none in place: one near each, the rest miss.
    expect(marks("llama", "salty")).toEqual(["near", "miss", "near", "miss", "miss"]);
    // Two Ls guessed, the answer's only L is the second: it is a hit and the first is a miss.
    expect(marks("llama", "plant")).toEqual(["miss", "hit", "hit", "miss", "miss"]);
    // Two Os in the answer, one guessed in place, one elsewhere.
    expect(marks("fools", "proof")).toEqual(["near", "near", "hit", "miss", "miss"]);
  });

  it("handles repeated letters in the answer", () => {
    expect(marks("plate", "apple")).toEqual(["near", "near", "near", "miss", "hit"]);
    expect(marks("papal", "apple")).toEqual(["near", "near", "hit", "miss", "near"]);
    expect(marks("eerie", "geese")).toEqual(["near", "hit", "miss", "miss", "hit"]);
  });
});

describe("five letters: play", () => {
  it("chooses the same daily word for everyone, per language", () => {
    expect(answerFor("en", 42)).toBe(answerFor("en", 42));
    expect(ANSWERS.en).toContain(answerFor("en", 42));
    expect(ANSWERS.rw).toContain(newGame("rw", "daily", 42).answer);
    const days = new Set(Array.from({ length: 40 }, (_, d) => answerFor("fr", d)));
    expect(days.size).toBeGreaterThan(20);
  });

  it("types, erases and only submits a full row", () => {
    let s = newGame("en", "practice", 1);
    s = typeLetter(typeLetter(s, "A"), "1");
    expect(s.current).toBe("a");
    s = erase(s);
    expect(s.current).toBe("");
    s = [..."abcd"].reduce(typeLetter, s);
    expect(submit(s)).toBe(s);
    s = typeLetter(typeLetter(s, "e"), "f");
    expect(s.current).toBe("abcde");
    expect(submit(s).guesses).toEqual(["abcde"]);
  });

  it("accepts accented typing (French)", () => {
    const s = { ...newGame("fr", "practice", 2), answer: "ecole" };
    const t = [..."École"].reduce(typeLetter, s);
    expect(t.current).toBe("ecole");
    expect(submit(t).won).toBe(true);
  });

  it("wins on the answer and loses after six tries", () => {
    const s = { ...newGame("en", "practice", 3), answer: "water" };
    const won = play(play(s, "plant"), "water");
    expect(won).toMatchObject({ won: true, over: true });
    expect(typeLetter(won, "a")).toBe(won);
    let lost = s;
    for (const w of ["plant", "house", "chair", "light", "sound", "bread"]) lost = play(lost, w);
    expect(lost).toMatchObject({ won: false, over: true });
    expect(lost.guesses).toHaveLength(6);
  });

  it("keeps the best known state of each letter", () => {
    const s = play(play({ ...newGame("en", "practice", 3), answer: "water" }, "tower"), "waste");
    const k = letterStates(s);
    expect(k.w).toBe("hit");
    expect(k.t).toBe("near");
    expect(k.o).toBe("miss");
    expect(k.a).toBe("hit");
  });

  it("restores exactly from a saved (JSON) state", () => {
    let a = typeLetter(play(newGame("rw", "daily", 99), "inama"), "a");
    let b: State = JSON.parse(JSON.stringify(a));
    a = play([..."maz"].reduce(typeLetter, a), "i");
    b = play([..."maz"].reduce(typeLetter, b), "i");
    expect(b).toEqual(a);
  });
});
