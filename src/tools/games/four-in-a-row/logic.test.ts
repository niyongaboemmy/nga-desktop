import { describe, expect, it } from "vitest";
import { bestMove, COLS, computerMove, drop, easyMove, landing, legalCols, newGame, over, type State } from "./logic";

const play = (s: State, cols: number[]) => cols.reduce(drop, s);

describe("four in a row", () => {
  it("drops discs to the lowest empty row and alternates players", () => {
    let s = newGame(1, "two");
    s = play(s, [3, 3]);
    expect(s.board[5 * COLS + 3]).toBe(1);
    expect(s.board[4 * COLS + 3]).toBe(2);
    expect(s.turn).toBe(1);
    expect(s.last).toBe(4 * COLS + 3);
  });

  it("refuses a full column", () => {
    const s = play(newGame(1, "two"), [0, 0, 0, 0, 0, 0]);
    expect(landing(s.board, 0)).toBe(-1);
    expect(drop(s, 0)).toBe(s);
    expect(legalCols(s.board)).not.toContain(0);
  });

  it("finds horizontal, vertical and diagonal wins with the line", () => {
    const h = play(newGame(1, "two"), [0, 0, 1, 1, 2, 2, 3]);
    expect(h.winner).toBe(1);
    expect(h.line).toEqual([35, 36, 37, 38]);
    expect(drop(h, 5)).toBe(h);
    const v = play(newGame(1, "two"), [0, 1, 0, 1, 0, 1, 0]);
    expect(v.winner).toBe(1);
    expect(v.line).toHaveLength(4);
    // Diagonal rising to the right for player 1.
    const d = play(newGame(1, "two"), [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
    expect(d.winner).toBe(1);
    expect(d.line).toHaveLength(4);
  });

  it("detects a draw on a full board with no line", () => {
    // Columns filled in pairs so no four ever lines up.
    const order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6];
    const s = play(newGame(1, "two"), order);
    expect(s.winner).toBe(0);
    expect(s.draw).toBe(true);
    expect(over(s)).toBe(true);
  });

  it("easy computer takes a win, else blocks, else plays legally", () => {
    // Player 2 to move with three in column 6: take the win.
    let s = play(newGame(5, "easy"), [0, 6, 1, 6, 0, 6, 1]);
    expect(s.turn).toBe(2);
    expect(easyMove(s)[0]).toBe(6);
    // Player 1 threatens 0-1-2 on the bottom: block at 3.
    s = play(newGame(5, "easy"), [0, 6, 1, 6, 2]);
    expect(easyMove(s)[0]).toBe(3);
    // Random but legal, many times.
    let t = play(newGame(9, "easy"), [0, 0, 0, 0, 0]);
    for (let i = 0; i < 20; i++) {
      t = { ...t, turn: 2 };
      const [c, r] = easyMove(t);
      expect(legalCols(t.board)).toContain(c);
      t = { ...t, r };
    }
  });

  it("normal computer wins, blocks and stays fast", () => {
    let s = play(newGame(1, "normal"), [0, 6, 1, 6, 0, 6, 1]);
    expect(bestMove(s)).toBe(6);
    s = play(newGame(1, "normal"), [0, 6, 1, 6, 2]);
    expect(bestMove(s)).toBe(3);
    const t0 = performance.now();
    const first = computerMove(play(newGame(1, "normal"), [3]));
    expect(performance.now() - t0).toBeLessThan(150);
    expect(first.board.filter((v) => v === 2)).toHaveLength(1);
  });

  it("plays whole games against itself legally", () => {
    for (const mode of ["easy", "normal"] as const) {
      let s = newGame(3, mode);
      let n = 0;
      while (!over(s) && n++ < 60) {
        const next = s.turn === 1 ? drop(s, easyMove(s)[0]) : computerMove(s);
        expect(next).not.toBe(s);
        s = next;
      }
      expect(over(s)).toBe(true);
    }
  });

  it("survives a save and restore", () => {
    const s = play(newGame(77, "easy"), [3, 2, 4]);
    const b: State = JSON.parse(JSON.stringify(s));
    expect(b).toEqual(s);
    expect(computerMove(b)).toEqual(computerMove(s));
  });
});
