// The games catalogue (plan §6.7.2). Titles and descriptions are in the tools'
// dictionaries (game.<id>, game.<id>.desc); everything else a game says is in its
// own strings.ts. Adding a game: add its id to GAME_IDS (here and in MIS), a
// folder with Game.tsx + strings.ts + logic tests, one entry below, two i18n keys.
import { Keyboard, Blocks, Brain, Bomb, Calculator, CircleDot, Grid3x3, Hash, KeyRound, Lightbulb, Puzzle, Search, Spline, Type, Wind, Activity, Repeat, PersonStanding } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { GameCategory, GameDef, GameId } from "./types";

export const GAMES: Array<GameDef & { icon: LucideIcon }> = [
  { id: "number-place", kind: "fun", category: "logic", icon: Hash, color: "#3b82f6", daily: true, minutes: [5, 15], players: "1", load: () => import("./number-place/Game") },
  { id: "picture-logic", kind: "fun", category: "logic", icon: Grid3x3, color: "#8b5cf6", daily: true, minutes: [5, 10], players: "1", load: () => import("./picture-logic/Game") },
  { id: "lights-out", ownNewGame: true, kind: "fun", category: "logic", icon: Lightbulb, color: "#eab308", minutes: [2, 5], players: "1", load: () => import("./lights-out/Game") },
  { id: "mines", ownNewGame: true, kind: "fun", category: "logic", icon: Bomb, color: "#64748b", minutes: [3, 8], players: "1", load: () => import("./mines/Game") },
  { id: "sliding-15", ownNewGame: true, kind: "fun", category: "logic", icon: Puzzle, color: "#14b8a6", minutes: [2, 6], players: "1", load: () => import("./sliding-15/Game") },
  { id: "merge-2048", kind: "fun", category: "logic", icon: Blocks, color: "#f97316", minutes: [3, 8], players: "1", load: () => import("./merge-2048/Game") },
  { id: "code-breaker", ownNewGame: true, kind: "fun", category: "logic", icon: KeyRound, color: "#a855f7", minutes: [3, 5], players: "1", load: () => import("./code-breaker/Game") },
  { id: "pairs", kind: "learning", category: "memory", icon: Brain, color: "#ec4899", minutes: [2, 4], players: "1-2", load: () => import("./pairs/Game") },
  { id: "echo", kind: "fun", category: "memory", icon: Repeat, color: "#06b6d4", minutes: [2, 3], players: "1", load: () => import("./echo/Game") },
  { id: "five-letter", kind: "learning", category: "words", icon: Type, color: "#22c55e", daily: true, minutes: [3, 5], players: "1", load: () => import("./five-letter/Game") },
  { id: "word-search", ownNewGame: true, kind: "learning", category: "words", icon: Search, color: "#0ea5e9", minutes: [3, 5], players: "1", load: () => import("./word-search/Game") },
  { id: "typing", kind: "learning", category: "words", icon: Keyboard, color: "#6366f1", minutes: [3, 8], players: "1", load: () => import("./typing/Game") },
  { id: "math-sprint", kind: "learning", category: "maths", icon: Calculator, color: "#ef4444", minutes: [1, 3], players: "1", load: () => import("./math-sprint/Game") },
  { id: "four-in-a-row", ownNewGame: true, kind: "fun", category: "together", icon: CircleDot, color: "#f59e0b", minutes: [3, 5], players: "1-2", load: () => import("./four-in-a-row/Game") },
  { id: "snake", ownNewGame: true, kind: "fun", category: "reflex", icon: Spline, color: "#16a34a", minutes: [2, 3], players: "1", load: () => import("./snake/Game") },
  { id: "igisoro", ownNewGame: true, kind: "fun", category: "culture", icon: Activity, color: "#b45309", minutes: [10, 20], players: "2", load: () => import("./igisoro/Game") },
  { id: "breathe", kind: "reset", category: "reset", icon: Wind, color: "#38bdf8", minutes: [1, 2], players: "1", load: () => import("./breathe/Game") },
  { id: "stretch", kind: "reset", category: "reset", icon: PersonStanding, color: "#84cc16", minutes: [2, 2], players: "1", load: () => import("./stretch/Game") },
];

export const CATEGORIES: GameCategory[] = ["logic", "memory", "words", "maths", "together", "reflex", "culture"];

export const LEARNING_IDS = GAMES.filter((g) => g.kind === "learning").map((g) => g.id);
export const RESET_IDS = GAMES.filter((g) => g.kind === "reset").map((g) => g.id);

export const findGame = (id: string | null | undefined) => GAMES.find((g) => g.id === id) ?? null;
export type { GameId };
