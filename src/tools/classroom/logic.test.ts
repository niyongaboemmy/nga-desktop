import { describe, expect, it } from "vitest";
import { bandFor, computeGrade, groupsText, levelFromSamples, makeGroups, neededFor, pickFair, pickRandom, seeded, smooth, zoneFor, type Person } from "./logic";

const people = (n: number): Person[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));

describe("fair name picker", () => {
  it("never repeats until everyone present was picked, then starts a new round", () => {
    const list = people(5);
    let picked: Array<number | string> = [];
    const seen: Array<number | string> = [];
    const rng = seeded(1);
    for (let i = 0; i < 5; i++) {
      const r = pickFair(list, picked, [], rng);
      seen.push(r.person!.id);
      picked = r.picked;
    }
    expect(new Set(seen).size).toBe(5);
    const next = pickFair(list, picked, [], rng);
    expect(next.picked).toHaveLength(1);
  });

  it("skips absent students", () => {
    const list = people(4);
    const rng = seeded(2);
    for (let i = 0; i < 50; i++) expect([3, 4]).toContain(pickFair(list, [], [1, 2], rng).person!.id);
    expect(pickFair(list, [], [1, 2, 3, 4]).person).toBeNull();
    expect(pickRandom(list, [1, 2, 3], rng)!.id).toBe(4);
  });

  it("is uniform over many draws (chi-square, 10 students, 10 000 draws)", () => {
    const list = people(10);
    const counts = new Map<number | string, number>();
    const rng = seeded(42);
    for (let i = 0; i < 10_000; i++) {
      const p = pickRandom(list, [], rng)!;
      counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
    }
    const expected = 1000;
    const chi = [...counts.values()].reduce((s, o) => s + (o - expected) ** 2 / expected, 0);
    expect(chi).toBeLessThan(21.67); // p = 0.01, 9 degrees of freedom
  });
});

describe("group maker", () => {
  it("makes groups whose sizes differ by at most one", () => {
    for (const [n, by, k] of [[23, "size", 4], [23, "count", 5], [7, "count", 3], [6, "size", 2], [3, "count", 10]] as const) {
      const { groups } = makeGroups(people(n), { by, n: k }, seeded(n));
      const sizes = groups.map((g) => g.length);
      expect(Math.max(...sizes) - Math.min(...sizes), `${n} ${by} ${k}`).toBeLessThanOrEqual(1);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
    }
  });

  it("keeps apart pairs in different groups", () => {
    const apart: Array<[number, number]> = [[1, 2], [3, 4], [5, 6], [1, 3]];
    for (let seed = 1; seed < 30; seed++) {
      const r = makeGroups(people(12), { by: "count", n: 4, apart }, seeded(seed));
      expect(r.clashes).toBe(0);
    }
  });

  it("reports pairs it could not separate", () => {
    const r = makeGroups(people(2), { by: "count", n: 1, apart: [[1, 2]] }, seeded(1));
    expect(r.clashes).toBe(1);
  });

  it("copies as text", () => {
    expect(groupsText([[{ id: 1, name: "A" }, { id: 2, name: "B" }], [{ id: 3, name: "C" }]])).toBe("Group 1: A, B\nGroup 2: C");
  });
});

describe("grade calculator", () => {
  const comps = [
    { name: "CAT 1", weight: 20, score: 15, max: 20 },
    { name: "CAT 2", weight: 20, score: 12, max: 20 },
    { name: "Exam", weight: 60, score: null, max: 100 },
  ];

  it("weights the assessed components", () => {
    const r = computeGrade(comps);
    expect(r.current).toBe(67.5);
    expect([r.assessed, r.totalWeight]).toEqual([40, 100]);
    expect(r.band!.grade).toBe("C");
  });

  it("works out what is needed on the rest", () => {
    expect(neededFor(comps, 70)).toBe(71.7);
    expect(neededFor(comps, 50)).toBe(38.3);
    expect(neededFor(comps.map((c) => ({ ...c, score: c.score ?? 50 })), 70)).toBeNull();
  });

  it("handles nothing assessed and bad rows", () => {
    expect(computeGrade([{ name: "x", weight: 10, score: null, max: 10 }]).current).toBeNull();
    expect(computeGrade([{ name: "x", weight: 0, score: 5, max: 10 }, { name: "y", weight: 10, score: 12, max: 10 }]).current).toBe(100);
  });

  it("finds the band", () => {
    expect(bandFor(80)!.grade).toBe("A");
    expect(bandFor(79.9)!.grade).toBe("B");
    expect(bandFor(0)!.grade).toBe("F");
  });
});

describe("noise level", () => {
  it("maps loudness to 0–100", () => {
    expect(levelFromSamples(new Float32Array(1024))).toBe(0);
    expect(levelFromSamples(new Float32Array(1024).fill(1))).toBe(100);
    expect(levelFromSamples(new Float32Array(1024).fill(0.01))).toBe(33); // −40 dBFS
  });

  it("zones and smoothing", () => {
    expect([zoneFor(10, 40, 70), zoneFor(50, 40, 70), zoneFor(80, 40, 70)]).toEqual(["quiet", "ok", "loud"]);
    expect(smooth(0, 100, 0.2)).toBe(20);
  });
});
