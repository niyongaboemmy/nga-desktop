import { useEffect, useRef } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { move, newGame, type Dir, type State } from "./logic";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

const KEYS: Record<string, Dir> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
};

export default function Game({ saved, save, paused, seed, tr, finish, reducedMotion }: GameProps<State>) {
  const state = saved ?? newGame(seed);
  const ref = useRef(state);
  ref.current = state;
  // A new game is saved at once, so leaving and coming back shows the same board.
  useEffect(() => {
    if (!saved) save(state);
  }, [saved, save, state]);

  const play = (d: Dir) => {
    if (paused) return;
    const s = ref.current;
    const next = move(s, d);
    if (next === s) return;
    save(next);
    if (next.over) finish({ score: next.score, won: next.won });
    else if (next.won && !s.won) finish({ score: next.score, won: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = KEYS[e.key];
      if (!d || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.closest("input, textarea")) return;
      e.preventDefault();
      play(d);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Swipe (touch screens, trackpads with a click-drag).
  const start = useRef<{ x: number; y: number } | null>(null);
  const onUp = (e: React.PointerEvent) => {
    const s0 = start.current;
    start.current = null;
    if (!s0) return;
    const dx = e.clientX - s0.x, dy = e.clientY - s0.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    play(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  };

  return (
    <div className={`m2048${reducedMotion ? " still" : ""}`}>
      <div className="m2048-top">
        <span className="m2048-score"><small>{tr("score")}</small><strong>{state.score}</strong></span>
        {state.won && !state.over && <span className="muted small">{tr("won")}</span>}
        {state.over && <span className="small" role="status">{tr("over", { n: state.score })}</span>}
      </div>
      <div
        className="m2048-board"
        onPointerDown={(e) => (start.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={onUp}
        role="grid"
        aria-label="2048"
      >
        {state.cells.map((v, i) => (
          <div key={`${i}-${v}-${v ? state.moves : 0}`} className={`m2048-cell${v ? " v" : ""}`} data-v={Math.min(v, 4096)} role="gridcell" aria-label={v ? String(v) : ""}>
            {v || ""}
          </div>
        ))}
      </div>
      <div className="m2048-pad" aria-hidden={false}>
        <button className="icon-btn" onClick={() => play("left")} aria-label={tr("left")}><ArrowLeft size={18} /></button>
        <button className="icon-btn" onClick={() => play("up")} aria-label={tr("up")}><ArrowUp size={18} /></button>
        <button className="icon-btn" onClick={() => play("down")} aria-label={tr("down")}><ArrowDown size={18} /></button>
        <button className="icon-btn" onClick={() => play("right")} aria-label={tr("right")}><ArrowRight size={18} /></button>
      </div>
    </div>
  );
}
