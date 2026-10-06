import { describe, expect, it } from "vitest";
import { H, newGame, speed, tick, W, type State } from "./logic";

const at = (x: number, y: number) => y * W + x;
const base = (over: Partial<State>): State => ({ snake: [at(5, 5), at(4, 5), at(3, 5)], dir: "right", food: at(15, 10), wrap: true, eaten: 0, over: false, won: false, r: 1, ...over });

describe("snake", () => {
  it("starts with a length-3 snake and food on a free cell", () => {
    const s = newGame(12);
    expect(s.snake).toHaveLength(3);
    expect(s.snake).not.toContain(s.food);
    expect(s.food).toBeGreaterThanOrEqual(0);
    expect(s.food).toBeLessThan(W * H);
  });

  it("moves forward and turns", () => {
    let s = tick(base({}));
    expect(s.snake).toEqual([at(6, 5), at(5, 5), at(4, 5)]);
    s = tick(s, "down");
    expect(s.snake[0]).toBe(at(6, 6));
    expect(s.dir).toBe("down");
  });

  it("never reverses into itself", () => {
    const s = tick(base({}), "left");
    expect(s.dir).toBe("right");
    expect(s.snake[0]).toBe(at(6, 5));
    expect(s.over).toBe(false);
  });

  it("grows when it eats and places new food elsewhere", () => {
    const s = tick(base({ food: at(6, 5) }));
    expect(s.snake).toEqual([at(6, 5), at(5, 5), at(4, 5), at(3, 5)]);
    expect(s.eaten).toBe(1);
    expect(s.snake).not.toContain(s.food);
  });

  it("wraps through gentle walls, or stops at solid ones", () => {
    const edge = base({ snake: [at(W - 1, 2), at(W - 2, 2), at(W - 3, 2)] });
    expect(tick(edge).snake[0]).toBe(at(0, 2));
    const top = base({ snake: [at(4, 0), at(4, 1), at(4, 2)], dir: "up" });
    expect(tick(top).snake[0]).toBe(at(4, H - 1));
    const solid = tick({ ...edge, wrap: false });
    expect(solid.over).toBe(true);
    expect(solid.snake).toEqual(edge.snake);
  });

  it("ends on biting itself, but may follow its own tail", () => {
    // A square loop: head at (5,5) going down into (5,6), which is body (not the tail).
    const s = base({ snake: [at(5, 5), at(6, 5), at(6, 6), at(5, 6), at(4, 6)], dir: "left" });
    expect(tick(s, "down").over).toBe(true);
    // Head chases the tail cell that moves away this step.
    const loop = base({ snake: [at(5, 5), at(6, 5), at(6, 6), at(5, 6)], dir: "left" });
    const t = tick(loop, "down");
    expect(t.over).toBe(false);
    expect(t.snake[0]).toBe(at(5, 6));
  });

  it("speeds up gently and stays capped", () => {
    expect(speed({ eaten: 0 })).toBe(230);
    expect(speed({ eaten: 3 })).toBeLessThan(230);
    expect(speed({ eaten: 500 })).toBe(130);
  });

  it("replays exactly from a saved state", () => {
    let a = newGame(5);
    const moves = ["right", "down", "down", "left", "left", "up", "right"] as const;
    for (const d of moves) a = tick(a, d);
    let b: State = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 30; i++) {
      const d = moves[i % moves.length];
      a = tick(a, d);
      b = tick(b, d);
    }
    expect(b).toEqual(a);
  });
});
