import { useEffect, useRef, useState } from "react";
import { Flag, RotateCcw } from "lucide-react";
import { count, flagsLeft, LEVELS as SIZES, newGame, reveal, toggleFlag, type Level, type State } from "./logic";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

const LEVELS: Level[] = ["small", "medium", "large"];
const MOVE: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const freshSeed = () => (Math.random() * 0x1_0000_0000) >>> 0;

export default function Game({ saved, save, paused, seed, tr, finish, reducedMotion }: GameProps<State>) {
  const state = saved ?? newGame(seed);
  const ref = useRef(state);
  ref.current = state;
  const [cursor, setCursor] = useState(Math.floor((state.size * state.size) / 2));

  useEffect(() => {
    if (!saved) save(state);
  }, [saved, save, state]);

  useEffect(() => {
    if (paused || state.status !== "play") return;
    const t = window.setInterval(() => save({ ...ref.current, seconds: ref.current.seconds + 1 }), 1000);
    return () => window.clearInterval(t);
  }, [paused, state.status, save]);

  const apply = (next: State) => {
    const s = ref.current;
    if (paused || next === s) return;
    save(next);
    if (next.status === "won" && s.status !== "won") finish({ won: true, score: next.seconds, better: "low" });
    if (next.status === "lost" && s.status !== "lost") finish({ won: false });
  };
  const fresh = (level: Level) => {
    if (paused) return;
    setCursor(Math.floor(SIZES[level].size ** 2 / 2));
    save(newGame(freshSeed(), level));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t?.closest("input, textarea, select")) return;
      const s = ref.current;
      const d = MOVE[e.key];
      if (d) {
        e.preventDefault();
        setCursor((c) => {
          const r = Math.min(s.size - 1, Math.max(0, Math.floor(c / s.size) + d[0]));
          const k = Math.min(s.size - 1, Math.max(0, (c % s.size) + d[1]));
          return r * s.size + k;
        });
      } else if ((e.key === " " || e.key === "Enter") && !t?.closest("button")) {
        e.preventDefault();
        apply(reveal(s, cursor));
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        apply(toggleFlag(s, cursor));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const over = state.status === "won" || state.status === "lost";
  const label = (i: number) => {
    if (state.open[i]) return state.mine[i] ? tr("mine") : count(state, i) ? String(count(state, i)) : tr("empty");
    if (state.flag[i]) return tr("flagged");
    return tr("hidden");
  };

  return (
    <div className={`mn${reducedMotion ? " still" : ""}`}>
      <div className="segmented-sm mn-levels" role="group">
        {LEVELS.map((l) => (
          <button key={l} className={state.level === l ? "on" : ""} onClick={() => fresh(l)}>{tr(l)}</button>
        ))}
      </div>
      <div className="mn-top">
        <span className="mn-stat"><small>{tr("flags")}</small><strong>{flagsLeft(state)}</strong></span>
        <span className="mn-stat"><small>{tr("time")}</small><strong>{clock(state.seconds)}</strong></span>
        <button className={`btn sm${state.status === "lost" ? " primary" : ""}`} onClick={() => fresh(state.level)}>
          <RotateCcw size={14} />{tr(state.status === "lost" ? "again" : "new")}
        </button>
      </div>
      <div
        className={`mn-board${over ? " over" : ""}`}
        data-size={state.size}
        style={{ gridTemplateColumns: `repeat(${state.size}, 1fr)`, gridTemplateRows: `repeat(${state.size}, 1fr)` }}
        role="grid"
        aria-label={tr("board")}
        onContextMenu={(e) => e.preventDefault()}
      >
        {state.open.map((o, i) => {
          const n = o && !state.mine[i] ? count(state, i) : 0;
          const showMine = state.mine[i] && (o || state.status === "lost");
          const cls = [
            "mn-cell",
            o ? "open" : "",
            showMine ? "mine" : "",
            i === state.hit ? "hit" : "",
            state.flag[i] && !o ? "flag" : "",
            state.status === "lost" && state.flag[i] && !state.mine[i] ? "wrong" : "",
            i === cursor && !over ? "cur" : "",
          ].filter(Boolean).join(" ");
          return (
            <div
              key={i}
              role="gridcell"
              aria-label={label(i)}
              className={cls}
              data-n={n || undefined}
              onClick={() => { setCursor(i); apply(reveal(ref.current, i)); }}
              onContextMenu={(e) => { e.preventDefault(); setCursor(i); apply(toggleFlag(ref.current, i)); }}
            >
              {showMine && !state.flag[i] ? <span className="mn-dot" /> : state.flag[i] && !o ? <Flag size={state.size > 12 ? 11 : 14} /> : n || ""}
            </div>
          );
        })}
      </div>
      <div className={`mn-status small ${state.status}`} role="status">
        {state.status === "won" ? tr("won", { s: state.seconds }) : state.status === "lost" ? tr("lost") : ""}
      </div>
    </div>
  );
}
