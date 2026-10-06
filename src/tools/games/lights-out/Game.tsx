import { useEffect, useRef, useState } from "react";
import { Lightbulb, RotateCcw, Shuffle } from "lucide-react";
import { hint, N, newGame, press, restart, type Level, type State } from "./logic";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

const LEVELS: Level[] = ["easy", "medium", "hard"];
const MOVE: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const freshSeed = () => (Math.random() * 0x1_0000_0000) >>> 0;

export default function Game({ saved, save, paused, seed, tr, finish, reducedMotion }: GameProps<State>) {
  const state = saved ?? newGame(seed);
  const ref = useRef(state);
  ref.current = state;
  const [cursor, setCursor] = useState(12);
  const [hinted, setHinted] = useState<number | null>(null);

  useEffect(() => {
    if (!saved) save(state);
  }, [saved, save, state]);

  // A quiet clock: counts only while playing.
  useEffect(() => {
    if (paused || state.solved) return;
    const t = window.setInterval(() => save({ ...ref.current, seconds: ref.current.seconds + 1 }), 1000);
    return () => window.clearInterval(t);
  }, [paused, state.solved, save]);

  const act = (i: number) => {
    if (paused) return;
    const s = ref.current;
    const next = press(s, i);
    if (next === s) return;
    setCursor(i);
    setHinted(null);
    save(next);
    if (next.solved) finish({ won: true, score: next.moves, better: "low" });
  };

  const start = (s: State) => {
    if (paused) return;
    setHinted(null);
    save(s);
  };

  const showHint = () => {
    if (paused || state.solved) return;
    const h = hint(state.cells);
    if (h === null) return;
    setHinted(h);
    setCursor(h);
    save({ ...state, hints: state.hints + 1 });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t?.closest("input, textarea, select")) return;
      const d = MOVE[e.key];
      if (d) {
        e.preventDefault();
        setCursor((c) => {
          const r = Math.min(N - 1, Math.max(0, Math.floor(c / N) + d[0]));
          const k = Math.min(N - 1, Math.max(0, (c % N) + d[1]));
          return r * N + k;
        });
      } else if ((e.key === " " || e.key === "Enter") && !t?.closest("button")) {
        e.preventDefault();
        act(cursor);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={`lo${reducedMotion ? " still" : ""}`}>
      <div className="segmented-sm lo-levels" role="group">
        {LEVELS.map((l) => (
          <button key={l} className={state.level === l ? "on" : ""} onClick={() => start(newGame(freshSeed(), l))}>{tr(l)}</button>
        ))}
      </div>
      <div className="lo-top">
        <span className="lo-stat"><small>{tr("moves")}</small><strong>{state.moves}</strong></span>
        <span className="lo-stat"><small>{tr("time")}</small><strong>{clock(state.seconds)}</strong></span>
        <button className="btn sm" onClick={showHint} disabled={state.solved}><Lightbulb size={14} />{tr("hint")}</button>
        <button className="btn sm" onClick={() => start(restart(state))}><RotateCcw size={14} />{tr("restart")}</button>
        <button className="btn sm" onClick={() => start(newGame(freshSeed(), state.level))}><Shuffle size={14} />{tr("new")}</button>
      </div>
      <div className={`lo-board${state.solved ? " done" : ""}`} role="grid" aria-label={tr("board")}>
        {state.cells.map((v, i) => (
          <div
            key={i}
            role="gridcell"
            aria-label={`${Math.floor(i / N) + 1}-${(i % N) + 1} ${tr(v ? "lit" : "unlit")}`}
            className={`lo-cell${v ? " on" : ""}${i === cursor && !state.solved ? " cur" : ""}${i === hinted ? " hint" : ""}`}
            onClick={() => act(i)}
          />
        ))}
      </div>
      <div className="lo-status small" role="status">{state.solved ? tr("solved", { n: state.moves }) : ""}</div>
    </div>
  );
}
