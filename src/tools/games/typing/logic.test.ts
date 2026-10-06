import { describe, expect, it } from "vitest";
import { LESSONS, PASSAGES, TEST_SECONDS, drill, knownKeys, newState, stats, testText, tick, type } from "./logic";

describe("typing tutor", () => {
  it("drills use only the keys learnt so far", () => {
    for (let i = 0; i < 6; i++) {
      const known = knownKeys(i);
      for (const seed of [1, 2, 3]) {
        const text = drill(i, seed);
        for (const c of text.replace(/ /g, "")) expect(known.has(c), `lesson ${LESSONS[i].id}: "${c}" in "${text}"`).toBe(true);
      }
    }
    expect(drill(7, 4)).toMatch(/^[\d ]+$/);
    expect(drill(6, 4)).toMatch(/^[A-Z]/);
    expect(drill(2, 9)).toBe(drill(2, 9));
  });

  it("scores words per minute and accuracy", () => {
    expect(stats("hello world", "hello world", 6)).toEqual({ correct: 11, errors: 0, accuracy: 100, wpm: 22 });
    expect(stats("abcde", "abxde", 60)).toMatchObject({ correct: 4, errors: 1, accuracy: 80, wpm: 1 });
    expect(stats("abc", "", 0)).toMatchObject({ accuracy: 100, wpm: 0 });
  });

  it("a lesson ends at its last character and is passed at 90 %+", () => {
    let s = newState(5, "en", "lesson", 0);
    s = type(s, s.target.slice(0, 3));
    s = tick(s);
    expect([s.done, s.elapsed]).toEqual([false, 1]);
    s = type(s, s.target + "extra");
    expect(s.done).toBe(true);
    expect(s.typed).toBe(s.target);
    expect(s.passed).toEqual([0]);
    const sloppy = type(newState(5, "en", "lesson", 1), "x".repeat(200));
    expect(sloppy.passed).toEqual([]);
  });

  it("the speed test runs for a minute after the first key, and survives a save", () => {
    let s = newState(3, "fr", "test");
    expect(tick(s).elapsed).toBe(0); // the clock waits for the first key
    s = type(s, s.target.slice(0, 10));
    for (let i = 0; i < TEST_SECONDS; i++) s = tick(s);
    expect(s.done).toBe(true);
    const restored = JSON.parse(JSON.stringify(s));
    expect(restored).toEqual(s);
    expect(testText("rw", 1).length).toBeGreaterThan(200);
    for (const list of Object.values(PASSAGES)) expect(list.length).toBeGreaterThanOrEqual(4);
  });
});
