// Echo: the computer plays a growing sequence on four pads, the player repeats it.
// Pure and serialisable; the whole sequence lives in the state.
import { step } from "../seed";

export const PADS = 4;

/** ready: waiting to start · show: the computer plays · input: the player repeats · over: a miss ended the round. */
export type Phase = "ready" | "show" | "input" | "over";

export interface State {
  /** Pads 0–3, in order. */
  seq: number[];
  /** The random stream (seed.ts step). */
  r: number;
  /** How many of seq the player has repeated this turn. */
  pos: number;
  phase: Phase;
  /** Longest sequence repeated in full. */
  score: number;
  /** The pad the player pressed by mistake (shown calmly at the end). */
  missed: number | null;
}

function grow(s: State): State {
  const [v, r] = step(s.r);
  return { ...s, seq: [...s.seq, Math.floor(v * PADS)], r };
}

export function newGame(seed: number): State {
  return grow({ seq: [], r: seed >>> 0, pos: 0, phase: "ready", score: 0, missed: null });
}

/** The player is ready: the computer plays the sequence. */
export const begin = (s: State): State => (s.phase === "ready" ? { ...s, phase: "show" } : s);

/** The computer finished playing: the player's turn. */
export const shown = (s: State): State => (s.phase === "show" ? { ...s, phase: "input", pos: 0 } : s);

/** Ask the computer to play the sequence again (no penalty). */
export const replay = (s: State): State => (s.phase === "input" ? { ...s, phase: "show", pos: 0 } : s);

/** The player pressed a pad. */
export function press(s: State, pad: number): State {
  if (s.phase !== "input" || pad < 0 || pad >= PADS) return s;
  if (s.seq[s.pos] !== pad) return { ...s, phase: "over", missed: pad };
  const pos = s.pos + 1;
  if (pos < s.seq.length) return { ...s, pos };
  // The whole sequence repeated: it grows by one and the computer plays again.
  return grow({ ...s, pos: 0, score: s.seq.length, phase: "show" });
}
