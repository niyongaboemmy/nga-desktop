import { describe, expect, it } from "vitest";
import { isDue, newCard, parseCards, preview, queue, review, shortInterval, stats, type Deck } from "./cards";

const T0 = new Date("2026-10-06T08:00:00Z");
const day = 86_400_000;

describe("flashcards (FSRS)", () => {
  it("a new card is due now", () => {
    const c = newCard("H₂O", "water", T0);
    expect(isDue(c, T0.getTime())).toBe(true);
    expect(c.srs.reps).toBe(0);
  });

  it("good spaces reviews further apart each time; again brings it back soon", () => {
    let c = newCard("Capital of Rwanda", "Kigali", T0);
    let now = T0.getTime();
    const gaps: number[] = [];
    for (let i = 0; i < 4; i++) {
      c = review(c, "good", new Date(now));
      const gap = Date.parse(c.srs.due) - now;
      gaps.push(gap);
      now = Date.parse(c.srs.due);
    }
    expect(gaps[3]).toBeGreaterThan(gaps[2]);
    expect(gaps[2]).toBeGreaterThan(gaps[1]);
    const lapsed = review(c, "again", new Date(now));
    expect(Date.parse(lapsed.srs.due) - now).toBeLessThan(day);
    expect(lapsed.srs.lapses).toBe(1);
  });

  it("previews each button's next interval, in order", () => {
    const p = preview(newCard("a", "b", T0), T0);
    expect(p.again).toBeLessThanOrEqual(p.hard);
    expect(p.hard).toBeLessThanOrEqual(p.good);
    expect(p.good).toBeLessThan(p.easy);
  });

  it("queues due cards first, then new ones up to the limit", () => {
    const old = review(newCard("old", "x", T0), "good", T0);
    const deck: Deck = { id: "d", name: "Chem", createdAt: 0, cards: [old, ...Array.from({ length: 30 }, (_, i) => newCard(`q${i}`, "a", T0))] };
    const later = Date.parse(old.srs.due) + 1;
    const q = queue(deck, later, 20);
    expect(q[0].front).toBe("old");
    expect(q).toHaveLength(21);
    expect(stats(deck, later)).toEqual({ total: 31, new: 30, due: 1, learned: 1 });
    expect(queue(deck, T0.getTime(), 5)).toHaveLength(5);
  });

  it("imports pasted cards", () => {
    expect(parseCards("Fe\tIron\nNa | Sodium\n\nno separator here\nK - Potassium\nH2O = water")).toEqual([
      { front: "Fe", back: "Iron" }, { front: "Na", back: "Sodium" }, { front: "K", back: "Potassium" }, { front: "H2O", back: "water" },
    ]);
  });

  it("labels intervals briefly", () => {
    expect([shortInterval(60_000), shortInterval(3 * 3600_000), shortInterval(4 * day), shortInterval(90 * day)]).toEqual(["1 min", "3 h", "4 d", "3 mo"]);
  });
});
