import { useEffect, useRef } from "react";
import { Shuffle } from "lucide-react";
import { arrow, newGame, slide, type Dir, type Size, type State } from "./logic";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

const KEYS: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const freshSeed = () => (Math.random() * 0x1_0000_0000) >>> 0;

export default function Game({ saved, save, paused, seed, tr, finish, reducedMotion }: GameProps<State>) {
  const state = saved ?? newGame(seed);
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    if (!saved) save(state);
  }, [saved, save, state]);

  useEffect(() => {
    if (paused || state.solved) return;
    const t = window.setInterval(() => save({ ...ref.current, seconds: ref.current.seconds + 1 }), 1000);
    return () => window.clearInterval(t);
  }, [paused, state.solved, save]);

  const apply = (next: State) => {
    const s = ref.current;
    if (paused || next === s) return;
    save(next);
    if (next.solved) finish({ won: true, score: next.moves, better: "low" });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = KEYS[e.key];
      if (!d || paused || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      e.preventDefault();
      apply(arrow(ref.current, d));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const { n } = state;
  const pct = 100 / n;
  return (
    <div className={`sl15${reducedMotion ? " still" : ""}`}>
      <div className="segmented-sm sl15-sizes" role="group">
        {([3, 4] as Size[]).map((k) => (
          <button key={k} className={n === k ? "on" : ""} onClick={() => !paused && save(newGame(freshSeed(), k))}>{tr(`size${k}`)}</button>
        ))}
      </div>
      <div className="sl15-top">
        <span className="sl15-stat"><small>{tr("moves")}</small><strong>{state.moves}</strong></span>
        <span className="sl15-stat"><small>{tr("time")}</small><strong>{clock(state.seconds)}</strong></span>
        <button className="btn sm" onClick={() => !paused && save(newGame(freshSeed(), n))}><Shuffle size={14} />{tr("new")}</button>
      </div>
      <div className={`sl15-board${state.solved ? " done" : ""}`} role="grid" aria-label={tr("board")}>
        <div className="sl15-inner">
        {state.tiles.map((v, i) => ({ v, i })).filter(({ v }) => v).sort((a, b) => a.v - b.v).map(({ v, i }) => (
          <div
            key={v}
            role="gridcell"
            aria-label={tr("tile", { n: v })}
            className={`sl15-tile${v === i + 1 ? " home" : ""}`}
            data-big={n === 3 ? "" : undefined}
            style={{ left: `${(i % n) * pct}%`, top: `${Math.floor(i / n) * pct}%`, width: `${pct}%`, height: `${pct}%` }}
            onClick={() => apply(slide(ref.current, i))}
          >
            <span>{v}</span>
          </div>
        ))}
        </div>
      </div>
      <div className="sl15-status small" role="status">{state.solved ? tr("solved", { n: state.moves }) : ""}</div>
    </div>
  );
}
