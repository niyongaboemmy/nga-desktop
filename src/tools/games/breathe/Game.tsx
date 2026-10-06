import { useEffect, useRef, type CSSProperties } from "react";
import { PATTERNS, done, phaseAt, type State } from "./logic";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

const FIRST: State = { pattern: "box", minutes: 1, elapsed: null };

export default function Game({ saved, save, paused, tr, finish, reducedMotion }: GameProps<State>) {
  const state = saved ?? FIRST;
  const ref = useRef(state);
  ref.current = state;
  const pattern = PATTERNS.find((p) => p.id === state.pattern) ?? PATTERNS[0];
  const running = state.elapsed !== null && !done(state);

  useEffect(() => {
    if (!running || paused) return;
    const id = window.setInterval(() => {
      const s = ref.current;
      if (s.elapsed === null) return;
      const next = { ...s, elapsed: Math.round((s.elapsed + 0.25) * 100) / 100 };
      save(next);
      if (done(next)) finish({ won: true });
    }, 250);
    return () => window.clearInterval(id);
  }, [running, paused, save, finish]);

  const at = phaseAt(pattern, state.elapsed ?? 0);
  // 0..1 size of the shape: grows on "in", stays big on hold, shrinks on "out".
  const size = !running ? 0.35 : at.phase === "in" ? at.progress : at.phase === "holdIn" ? 1 : at.phase === "out" ? 1 - at.progress : 0;

  return (
    <div className={`brz${reducedMotion ? " still" : ""}`}>
      <div className="brz-stage" aria-live="polite">
        <div className="brz-ring" style={{ "--s": 0.45 + size * 0.55 } as CSSProperties}>
          {running ? (
            <span className="brz-word">
              <strong>{tr(at.phase)}</strong>
              <span>{at.left}</span>
            </span>
          ) : state.elapsed !== null ? (
            <span className="brz-word"><span>{tr("done")}</span></span>
          ) : null}
        </div>
      </div>
      {!running && (
        <div className="brz-controls">
          <div className="segmented-sm" role="group">
            {PATTERNS.map((p) => (
              <button key={p.id} className={state.pattern === p.id ? "on" : ""} aria-pressed={state.pattern === p.id} onClick={() => save({ ...state, pattern: p.id })}>{tr(p.id)}</button>
            ))}
          </div>
          <div className="segmented-sm" role="group">
            {([1, 2] as const).map((m) => (
              <button key={m} className={state.minutes === m ? "on" : ""} aria-pressed={state.minutes === m} onClick={() => save({ ...state, minutes: m })}>{tr(`min${m}`)}</button>
            ))}
          </div>
          <button className="btn primary" autoFocus onClick={() => save({ ...state, elapsed: 0 })}>{state.elapsed === null ? tr("start") : tr("again")}</button>
        </div>
      )}
    </div>
  );
}
