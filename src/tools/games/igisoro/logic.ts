// Igisoro, the Rwandan four-row mancala, for two players on one device. Pure and serialisable.
//
// The board is 4 rows × 8 pits. Each player owns the two rows nearest them: a BACK (outer)
// row and a FRONT (inner) row. A player's 16 pits form a loop, numbered from that player's
// own point of view:
//   0..7   back row, from the player's left to right,
//   8..15  front row, from the player's right to left,
// so sowing "counter-clockwise" is simply index + 1 (wrapping 15 -> 0).
// The board array holds 32 numbers: player 0's loop (pits 0..15), then player 1's (16..31).
// Player 0 sits at the bottom of the screen, player 1 at the top.

export type Capture = "inner-both" | "inner-either" | "none";

export interface Variant {
  /** Seeds in each of a player's 16 pits at the start (same for both players; 32 in all). */
  initial: number[];
  /** A move must start from a pit with at least this many seeds. */
  minSow: number;
  /** Relay: the last seed lands in an occupied pit -> lift them all and sow on. */
  relay: boolean;
  /** When the last seed lands in an occupied FRONT-row pit:
   *  inner-both: take the opponent's two facing pits if BOTH hold seeds;
   *  inner-either: take them if at least one holds seeds; none: no captures. */
  capture: Capture;
}

const backFour = [4, 4, 4, 4, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0];
const twoEach = Array<number>(16).fill(2);

/** The rule sets the super admin can choose from (GameProps.variant). */
export const VARIANTS: Record<string, Variant> = {
  /** 4 seeds in each back-row pit; relay sowing; capture both facing pits; move from 2+ seeds. */
  standard: { initial: backFour, minSow: 2, relay: true, capture: "inner-both" },
  /** As standard, but a single seed may be moved too. */
  singles: { initial: backFour, minSow: 1, relay: true, capture: "inner-both" },
  /** Simpler: 2 seeds in every pit, no relay (a move ends where its last seed lands, unless it captures). */
  beginner: { initial: twoEach, minSow: 2, relay: false, capture: "inner-both" },
};

export const DEFAULT_VARIANT = "standard";
export const variantId = (v: string | null | undefined) => (v && VARIANTS[v] ? v : DEFAULT_VARIANT);

/** A relay chain longer than this ends the turn (a safety net against endless loops). */
export const MAX_LAPS = 200;

export type Player = 0 | 1;

export interface LastMove {
  player: Player;
  /** Loop index the move started from. */
  pit: number;
  /** Seeds lifted from that pit to begin. */
  seeds: number;
  /** Seeds taken from the opponent during the move. */
  captured: number;
  /** Global indices where captures happened (the capturing front pits). */
  captures: number[];
  /** Global index where the last seed fell. */
  end: number;
}

export interface State {
  variant: string;
  pits: number[];
  turn: Player;
  /** -1 while playing. */
  winner: -1 | Player;
  last: LastMove | null;
  moves: number;
}

export interface Frame {
  pits: number[];
  /** Global index the frame is about. */
  at: number;
  /** Seeds still in hand after this frame. */
  hand: number;
  kind: "lift" | "sow" | "capture";
}

export const g = (p: Player, i: number) => p * 16 + i;
export const isFront = (i: number) => i >= 8;

/** The opponent's two pits facing a front pit (own loop index 8..15): [front, back] in the opponent's loop. */
export function facing(i: number): [number, number] {
  const k = 15 - i; // own column, counted from the player's left
  return [8 + k, 7 - k];
}

/** Where a pit sits on screen: row 0 (top) .. 3 (bottom), column 0 (left) .. 7. */
export function screenPos(p: Player, i: number): [number, number] {
  if (p === 0) return i < 8 ? [3, i] : [2, 15 - i];
  return i < 8 ? [0, 7 - i] : [1, i - 8];
}

/** The pit at a screen position. */
export function fromScreen(row: number, col: number): [Player, number] {
  if (row === 3) return [0, col];
  if (row === 2) return [0, 15 - col];
  if (row === 0) return [1, 7 - col];
  return [1, col + 8];
}

export function newGame(variant: string | null = DEFAULT_VARIANT): State {
  const id = variantId(variant);
  const v = VARIANTS[id];
  return { variant: id, pits: [...v.initial, ...v.initial], turn: 0, winner: -1, last: null, moves: 0 };
}

export function legalPits(s: State, p: Player = s.turn): number[] {
  const min = VARIANTS[variantId(s.variant)].minSow;
  const out: number[] = [];
  for (let i = 0; i < 16; i++) if (s.pits[g(p, i)] >= min) out.push(i);
  return out;
}

export const total = (pits: number[]) => pits.reduce((a, b) => a + b, 0);

/** Play a move from the current player's loop pit `pit`. Returns the new state and the
 *  step-by-step frames for an animation. An illegal move returns the same state, no frames. */
export function move(s: State, pit: number): { state: State; frames: Frame[] } {
  if (s.winner !== -1 || !legalPits(s).includes(pit)) return { state: s, frames: [] };
  const v = VARIANTS[variantId(s.variant)];
  const p = s.turn;
  const o: Player = p === 0 ? 1 : 0;
  const pits = s.pits.slice();
  const frames: Frame[] = [];
  const snap = (at: number, hand: number, kind: Frame["kind"]) => frames.push({ pits: pits.slice(), at, hand, kind });

  let hand = pits[g(p, pit)];
  pits[g(p, pit)] = 0;
  snap(g(p, pit), hand, "lift");
  let pos = pit;
  let captured = 0;
  const captures: number[] = [];
  for (let laps = 0; ; laps++) {
    while (hand > 0) {
      pos = (pos + 1) % 16;
      pits[g(p, pos)]++;
      hand--;
      snap(g(p, pos), hand, "sow");
    }
    if (pits[g(p, pos)] === 1 || laps >= MAX_LAPS) break; // landed in an empty pit: the turn ends
    if (isFront(pos) && v.capture !== "none") {
      const [f, b] = facing(pos);
      const nf = pits[g(o, f)], nb = pits[g(o, b)];
      if (v.capture === "inner-both" ? nf > 0 && nb > 0 : nf + nb > 0) {
        hand = nf + nb;
        pits[g(o, f)] = 0;
        pits[g(o, b)] = 0;
        captured += hand;
        captures.push(g(p, pos));
        snap(g(p, pos), hand, "capture");
        // Captured seeds are sown starting IN the pit where the move began.
        pos = (pit + 15) % 16;
        continue;
      }
    }
    if (!v.relay) break;
    hand = pits[g(p, pos)];
    pits[g(p, pos)] = 0;
    snap(g(p, pos), hand, "lift");
  }
  const next: State = {
    ...s,
    pits,
    turn: o,
    moves: s.moves + 1,
    last: { player: p, pit, seeds: s.pits[g(p, pit)], captured, captures, end: g(p, pos) },
  };
  // A player who cannot move loses.
  if (!legalPits(next, o).length) next.winner = p;
  return { state: next, frames };
}
