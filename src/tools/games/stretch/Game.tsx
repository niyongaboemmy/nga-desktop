import { useEffect, useRef, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Eye, Hand, HandHeart, PersonStanding, Sofa, Zap } from "lucide-react";
import { ROUTINES, STEP_SEC, at, routine, skip, type RoutineId, type State } from "./logic";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

const ICON = { desk: Sofa, tall: PersonStanding, eyes: Eye, energy: Zap, clap: Hand, back: HandHeart } as const;
const START: State = { routine: null, elapsed: 0 };

export default function Game({ saved, save, paused, tr, finish, reducedMotion }: GameProps<State>) {
  const state = saved ?? START;
  const ref = useRef(state);
  ref.current = state;
  const r = routine(state.routine);
  const pos = at(state);

  useEffect(() => {
    if (!r || pos.over || paused) return;
    const id = window.setInterval(() => {
      const s = ref.current;
      const next = { ...s, elapsed: s.elapsed + 1 };
      save(next);
      if (at(next).over) finish({ won: true });
    }, 1000);
    return () => window.clearInterval(id);
  }, [r, pos.over, paused, save, finish]);

  if (!r) {
    return (
      <div className="stretch">
        <p className="muted">{tr("pick")}</p>
        <ul className="stretch-pick">
          {ROUTINES.map((x) => {
            const I = ICON[x.id];
            return (
              <li key={x.id}>
                <button onClick={() => save({ routine: x.id as RoutineId, elapsed: 0 })}>
                  <I size={22} />
                  <span>{tr(x.id)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const I = ICON[r.id];
  const frac = pos.over ? 1 : 1 - pos.left / STEP_SEC;
  return (
    <div className={`stretch${reducedMotion ? " still" : ""}`}>
      <div className="stretch-card" aria-live="polite">
        <div className="stretch-ring" style={{ "--p": frac } as CSSProperties}>
          <I size={46} />
          {!pos.over && <span className="stretch-left">{pos.left}</span>}
        </div>
        <div className="stretch-text">
          <span className="muted small">{tr(r.id)} · {tr("step", { n: pos.index + 1, total: r.steps.length })}</span>
          <strong>{pos.over ? tr("done") : tr(r.steps[pos.index])}</strong>
        </div>
        <ol className="stretch-dots" aria-hidden>
          {r.steps.map((s, i) => <li key={s} className={i < pos.index || pos.over ? "done" : i === pos.index ? "on" : ""} />)}
        </ol>
      </div>
      <div className="row stretch-controls">
        {!pos.over && <button className="icon-btn" onClick={() => save(skip(state, -1))} aria-label={tr("prev")} title={tr("prev")}><ChevronLeft size={18} /></button>}
        {!pos.over && <button className="icon-btn" onClick={() => save(skip(state, 1))} aria-label={tr("next")} title={tr("next")}><ChevronRight size={18} /></button>}
        <button className="btn sm" onClick={() => save(START)}>{pos.over ? tr("again") : tr("stop")}</button>
      </div>
    </div>
  );
}
