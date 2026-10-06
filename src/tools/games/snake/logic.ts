// Snake: eat, grow, don't bump into yourself. Pure and serialisable.
import { step } from "../seed";

export const W = 20;
export const H = 15;

export type Dir = "up" | "down" | "left" | "right";

export interface State {
  /** Cell indices (row * W + col), head first. */
  snake: number[];
  dir: Dir;
  food: number;
  /** Gentle walls: the snake passes through the edges and comes out on the other side. */
  wrap: boolean;
  eaten: number;
  over: boolean;
  /** Filled the whole grid. */
  won: boolean;
  /** Random stream (seed.ts step) for food. */
  r: number;
}

const DELTA: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };

/** Put food on a random free cell (none when the grid is full). */
export function placeFood(snake: number[], r: number): [number, number] {
  const taken = new Set(snake);
  const free: number[] = [];
  for (let i = 0; i < W * H; i++) if (!taken.has(i)) free.push(i);
  if (!free.length) return [-1, r];
  const [x, r2] = step(r);
  return [free[Math.floor(x * free.length)], r2];
}

export function newGame(seed: number, wrap = true): State {
  const row = Math.floor(H / 2);
  const snake = [row * W + 6, row * W + 5, row * W + 4];
  const [food, r] = placeFood(snake, seed >>> 0);
  return { snake, dir: "right", food, wrap, eaten: 0, over: false, won: false, r };
}

/** Milliseconds per step: starts slow, a little faster every 3 foods, never fast. */
export const speed = (s: Pick<State, "eaten">) => Math.max(130, 230 - Math.floor(s.eaten / 3) * 10);

/** Turning straight back is ignored. */
export const canTurn = (from: Dir, to: Dir) => OPPOSITE[from] !== to;

/** One step in `dir` (or straight on, if `dir` would reverse into the body). */
export function tick(s: State, want: Dir = s.dir): State {
  if (s.over) return s;
  const dir = canTurn(s.dir, want) ? want : s.dir;
  const head = s.snake[0];
  let x = (head % W) + DELTA[dir][0];
  let y = Math.floor(head / W) + DELTA[dir][1];
  if (x < 0 || x >= W || y < 0 || y >= H) {
    if (!s.wrap) return { ...s, dir, over: true };
    x = (x + W) % W;
    y = (y + H) % H;
  }
  const next = y * W + x;
  const eats = next === s.food;
  // The tail moves away this step unless the snake grows, so its cell is free.
  const body = eats ? s.snake : s.snake.slice(0, -1);
  if (body.includes(next)) return { ...s, dir, over: true };
  const snake = [next, ...body];
  if (!eats) return { ...s, dir, snake };
  const [food, r] = placeFood(snake, s.r);
  const won = food < 0;
  return { ...s, dir, snake, food, r, eaten: s.eaten + 1, over: won, won };
}
