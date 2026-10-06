import { useEffect, useRef, useState } from "react";
import { Eraser, Shuffle } from "lucide-react";
import { clear, colDone, CROSSED, EMPTY, FILLED, mark, newGame, rowDone, type Size, type State } from "./logic";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

type Mode = "daily" | Size;
const MODES: Mode[] = ["daily", 5, 10, 15];
const MOVE: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const freshSeed = () => (Math.random() * 0x1_0000_0000) >>> 0;

interface Drag { m: number; start: number; axis: "row" | "col" | null }

export default function Game({ saved, save, paused, dailySeed, tr, finish, reducedMotion }: GameProps<State>) {
  const state = saved ?? newGame(dailySeed, 10, true);
  const ref = useRef(state);
  ref.current = state;
  const [cursor, setCursor] = useState(0);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    if (!saved) save(state);
  }, [saved, save, state]);

  useEffect(() => {
    if (paused || state.solved) return;
    const t = window.setInterval(() => save({ ...ref.current, seconds: ref.current.seconds + 1 }), 1000);
    return () => window.clearInterval(t);
  }, [paused, state.solved, save]);

  useEffect(() => {
    const up = () => (drag.current = null);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const apply = (next: State) => {
    const s = ref.current;
    if (paused || next === s) return;
    ref.current = next; // a drag chains several marks before the next render
    save(next);
    if (next.solved && !s.solved) finish({ won: true, score: next.seconds, better: "low" });
  };
  const toggle = (i: number, m: number) => apply(mark(ref.current, i, ref.current.marks[i] === m ? EMPTY : m));
  const start = (m: Mode) => {
    if (paused) return;
    if (m === "daily" && state.daily && state.seed === dailySeed) return;
    setCursor(0);
    save(m === "daily" ? newGame(dailySeed, 10, true) : newGame(freshSeed(), m));
  };

  const n = state.n;
  const onDown = (e: React.PointerEvent, i: number) => {
    if (paused || state.solved || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault();
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    const want = e.button === 2 ? CROSSED : FILLED;
    const m = state.marks[i] === want ? EMPTY : want;
    drag.current = { m, start: i, axis: null };
    setCursor(i);
    apply(mark(ref.current, i, m));
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || paused) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const raw = el?.closest<HTMLElement>("[data-i]")?.dataset.i;
    if (raw === undefined) return;
    const i = Number(raw);
    if (i === d.start) return;
    const sameRow = Math.floor(i / n) === Math.floor(d.start / n), sameCol = i % n === d.start % n;
    if (!d.axis) d.axis = sameRow ? "row" : sameCol ? "col" : null;
    if ((d.axis === "row" && !sameRow) || (d.axis === "col" && !sameCol) || !d.axis) return;
    // Paint every cell from the start to here, so a fast drag leaves no holes.
    const stride = d.axis === "row" ? 1 : n;
    const dir = i > d.start ? stride : -stride;
    for (let k = d.start; k !== i + dir; k += dir) apply(mark(ref.current, k, d.m));
    setCursor(i);
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
          const r = Math.min(n - 1, Math.max(0, Math.floor(c / n) + d[0]));
          const k = Math.min(n - 1, Math.max(0, (c % n) + d[1]));
          return r * n + k;
        });
      } else if ((e.key === " " || e.key === "Enter") && !t?.closest("button")) {
        e.preventDefault();
        toggle(cursor, FILLED);
      } else if (e.key === "x" || e.key === "X") {
        e.preventDefault();
        toggle(cursor, CROSSED);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const mode: Mode = state.daily ? "daily" : n;
  const cr = Math.floor(cursor / n), cc = cursor % n;
  const markName = (m: number) => tr(m === FILLED ? "filled" : m === CROSSED ? "crossed" : "blank");

  return (
    <div className={`pl${reducedMotion ? " still" : ""}`} onContextMenu={(e) => e.preventDefault()}>
      <div className="segmented-sm pl-modes" role="group">
        {MODES.map((m) => (
          <button key={m} className={mode === m ? "on" : ""} onClick={() => start(m)}>{tr(m === "daily" ? "daily" : `size${m}`)}</button>
        ))}
      </div>
      <div className="pl-top">
        <span className="pl-stat"><small>{tr("time")}</small><strong>{clock(state.seconds)}</strong></span>
        <button className="btn sm" onClick={() => apply(clear(state))} disabled={state.solved}><Eraser size={14} />{tr("clear")}</button>
        {!state.daily && <button className="btn sm" onClick={() => start(n)}><Shuffle size={14} />{tr("new")}</button>}
      </div>
      <div className={`pl-wrap${state.solved ? " done" : ""}`} data-n={n} style={{ ["--n" as string]: n }}>
        <div className="pl-corner" />
        <div className="pl-cols">
          {state.cols.map((c, k) => (
            <div key={k} className={`pl-clue${colDone(state, k) ? " met" : ""}${k === cc ? " here" : ""}`}>
              {(c.length ? c : [0]).map((v, j) => <span key={j}>{v}</span>)}
            </div>
          ))}
        </div>
        <div className="pl-rows">
          {state.rows.map((c, k) => (
            <div key={k} className={`pl-clue${rowDone(state, k) ? " met" : ""}${k === cr ? " here" : ""}`}>
              {(c.length ? c : [0]).map((v, j) => <span key={j}>{v}</span>)}
            </div>
          ))}
        </div>
        <div className="pl-grid" role="grid" aria-label={tr("board")} onPointerMove={onMove}>
          {state.marks.map((m, i) => {
            const r = Math.floor(i / n), c = i % n;
            const cls = [
              "pl-cell",
              m === FILLED ? "fill" : m === CROSSED ? "cross" : "",
              i === cursor && !state.solved ? "cur" : "",
              c % 5 === 4 && c < n - 1 ? "br" : "",
              r % 5 === 4 && r < n - 1 ? "bb" : "",
            ].filter(Boolean).join(" ");
            return (
              <div
                key={i}
                data-i={i}
                role="gridcell"
                aria-label={`${tr("cell", { r: r + 1, c: c + 1 })}: ${markName(m)}`}
                className={cls}
                onPointerDown={(e) => onDown(e, i)}
              />
            );
          })}
        </div>
      </div>
      <div className="pl-status small" role="status">{state.solved ? tr("solved", { t: clock(state.seconds) }) : ""}</div>
    </div>
  );
}
