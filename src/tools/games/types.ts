// The games programme's shared types (plan §6.7.6). A game is a React component
// that keeps its whole state in one serialisable value: the shell saves it as it
// changes and gives it back next time, so stopping a game never loses anything.
import type { ComponentType } from "react";
import type { Lang } from "../i18n";

/** Every game, in catalogue order. Must match MIS services/desktop/games.ts GAME_IDS. */
export const GAME_IDS = [
  "igisoro", "number-place", "picture-logic", "lights-out", "mines", "sliding-15", "merge-2048",
  "pairs", "echo", "five-letter", "word-search", "math-sprint", "code-breaker", "four-in-a-row", "snake",
  "breathe", "stretch",
] as const;
export type GameId = (typeof GAME_IDS)[number];

/** fun: counts fully; learning: counts half towards the daily budget; reset: never counts, never locked. */
export type GameKind = "fun" | "learning" | "reset";
export type GameCategory = "logic" | "memory" | "words" | "maths" | "reflex" | "together" | "culture" | "reset";

/** A game's own texts: the same keys in every language (games/strings.test.ts checks). */
export type GameStrings = Record<Lang, Record<string, string>>;

export interface GameResult {
  /** Set when the game has a winner or a solved state. */
  won?: boolean;
  /** A number to keep as a personal best (no leaderboards, plan §6.7.1). */
  score?: number;
  /** Is a bigger score better ("high", default) or a smaller one ("low", e.g. seconds)? */
  better?: "high" | "low";
}

export interface GameProps<S = unknown> {
  /** The state this game saved last time (null: start a new game). */
  saved: S | null;
  /** Save the whole state (call on every change; cheap). null forgets it (game over). */
  save: (state: S | null) => void;
  /** The shell paused the game (locked, window hidden, help open): stop clocks and ignore input. */
  paused: boolean;
  /** Today's school-wide seed for this game (the same for everyone, Kigali date). */
  dailySeed: number;
  /** A fresh random seed for this game session. */
  seed: number;
  /** The game's own strings, in the tools' language ({placeholders} filled). */
  tr: (key: string, vars?: Record<string, string | number>) => string;
  lang: Lang;
  /** Sound is allowed (off by default during school hours). */
  sound: boolean;
  /** prefers-reduced-motion: no shakes, no slides, no flashing. */
  reducedMotion: boolean;
  /** A game reached its end (won, lost, finished a round). */
  finish: (result: GameResult) => void;
  /** Igisoro: the variant the super admin approved. */
  variant: string | null;
  /** The person's personal best (from finish()), if any. */
  best: number | null;
}

export interface GameModule {
  default: ComponentType<GameProps<any>>;
  strings: GameStrings;
}

export interface GameDef {
  id: GameId;
  kind: GameKind;
  category: GameCategory;
  /** Emoji-free icon: a lucide icon name is chosen in catalog.ts. */
  color: string;
  /** A shared daily puzzle (same seed for the whole school today). */
  daily?: boolean;
  /** Typical minutes per game, shown on the card. */
  minutes: [number, number];
  players: "1" | "1-2" | "2";
  /** The game has its own "new game / puzzle" button (the shell then hides its own). */
  ownNewGame?: boolean;
  load: () => Promise<GameModule>;
}
