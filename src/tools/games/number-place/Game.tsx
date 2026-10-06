import { useEffect, useRef, useState } from "react";
import { Eraser, Lightbulb, Pencil } from "lucide-react";
import { box, col, conflicts, erase, hint, newGame, row, setValue, toggleNote, type Mode, type State } from "./logic";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

const MODES: Mode[] = ["daily", "easy", "medium", "hard", "expert"];
const MOVE: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const freshSeed = () => (Math.random() * 0x1_0000_0000) >>> 0;
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function Game({ saved, save, paused, dailySeed, tr, finish, reducedMotion }: GameProps<State>) {
  const state = saved ?? newGame(dailySeed, "daily");
  const ref = useRef(state);
  ref.current = state;
  const [cursor, setCursor] = useState(() => Math.max(0, state.values.indexOf(0)));
  const [noting, setNoting] = useState(false);

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
    if (next.solved && !s.solved) finish({ won: true, score: next.seconds, better: "low" });
  };
  const digit = (d: number) => apply(noting ? toggleNote(ref.current, cursor, d) : setValue(ref.current, cursor, d));
  const start = (m: Mode) => {
    if (paused) return;
    // Coming back to today's puzzle keeps its progress.
    if (m === "daily" && state.mode === "daily" && state.seed === dailySeed) return;
    const next = newGame(m === "daily" ? dailySeed : freshSeed(), m);
    setCursor(Math.max(0, next.values.indexOf(0)));
    save(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      const d = MOVE[e.key];
      if (d) {
        e.preventDefault();
        setCursor((c) => ((row(c) + d[0] + 9) % 9) * 9 + ((col(c) + d[1] + 9) % 9));
      } else if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        digit(Number(e.key));
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        e.preventDefault();
        apply(erase(ref.current, cursor));
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setNoting((v) => !v);
      } else if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        apply(hint(ref.current, cursor));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const bad = conflicts(state.values);
  const curVal = state.values[cursor];
  const placed = DIGITS.map((d) => state.values.filter((v) => v === d).length);

  return (
    <div className={`np${reducedMotion ? " still" : ""}`}>
      <div className="segmented-sm np-modes" role="group">
        {MODES.map((m) => (
          <button key={m} className={state.mode === m ? "on" : ""} onClick={() => start(m)}>{tr(m)}</button>
        ))}
      </div>
      <div className="np-main">
        <div className={`np-board${state.solved ? " done" : ""}`} role="grid" aria-label={tr("board")}>
          {state.values.map((v, i) => {
            const cls = [
              "np-cell",
              state.puzzle[i] ? "given" : v ? "user" : "",
              i === cursor ? "cur" : row(i) === row(cursor) || col(i) === col(cursor) || box(i) === box(cursor) ? "peer" : "",
              v && v === curVal && i !== cursor ? "same" : "",
              bad[i] && !state.puzzle[i] ? "bad" : bad[i] ? "clash" : "",
              state.hinted.includes(i) ? "hinted" : "",
              col(i) % 3 === 2 && col(i) < 8 ? "br" : "",
              row(i) % 3 === 2 && row(i) < 8 ? "bb" : "",
            ].filter(Boolean).join(" ");
            return (
              <div
                key={i}
                role="gridcell"
                aria-label={`${tr("cell", { r: row(i) + 1, c: col(i) + 1 })}: ${v || tr("empty")}`}
                aria-selected={i === cursor}
                className={cls}
                onClick={() => setCursor(i)}
              >
                {v ? v : state.notes[i] ? (
                  <span className="np-notes">
                    {DIGITS.map((d) => <span key={d}>{state.notes[i] & (1 << d) ? d : ""}</span>)}
                  </span>
                ) : ""}
              </div>
            );
          })}
        </div>
        <div className="np-side">
          <div className="np-time"><small>{tr("time")}</small><strong>{clock(state.seconds)}</strong></div>
          <div className="np-pad">
            {DIGITS.map((d) => (
              <button key={d} className={`np-key${placed[d - 1] >= 9 ? " full" : ""}`} onClick={() => digit(d)} disabled={state.solved}>{d}</button>
            ))}
          </div>
          <div className="np-tools">
            <button className={`btn sm${noting ? " primary" : ""}`} aria-pressed={noting} onClick={() => setNoting((v) => !v)}><Pencil size={14} />{tr("notes")}</button>
            <button className="btn sm" onClick={() => apply(erase(state, cursor))} disabled={state.solved}><Eraser size={14} />{tr("erase")}</button>
            <button className="btn sm" onClick={() => apply(hint(state, cursor))} disabled={state.solved || !state.hintsLeft}><Lightbulb size={14} />{tr("hint", { n: state.hintsLeft })}</button>
          </div>
          <div className="np-status small" role="status">{state.solved ? tr("solved", { t: clock(state.seconds) }) : ""}</div>
        </div>
      </div>
    </div>
  );
}
