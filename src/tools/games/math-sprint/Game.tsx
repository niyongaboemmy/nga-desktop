import { useEffect, useRef, useState } from "react";
import { answer, LEVELS, newRound, num, ROUND_MS, start, tick, type Level, type State } from "./logic";
import { tone } from "./sound";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

/** How long the previous answer stays visible (ms). */
const SHOW_LAST = 1600;

export default function Game({ saved, save, paused, seed, tr, finish, sound, reducedMotion, best }: GameProps<State>) {
  const state = saved ?? newRound(1, seed);
  const ref = useRef(state);
  ref.current = state;
  useEffect(() => {
    if (!saved) save(state);
  }, [saved, save, state]);

  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [lastVisible, setLastVisible] = useState(false);

  // The clock: runs only while the round runs and the shell has not paused us.
  useEffect(() => {
    if (state.phase !== "run" || paused) return;
    let prev = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const s = ref.current;
      const next = tick(s, now - prev);
      prev = now;
      if (next === s) return;
      save(next);
      if (next.phase === "over") {
        if (sound) tone(523, 260, "sine", 0.05);
        finish({ score: next.score, better: "high" });
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, paused]);

  useEffect(() => {
    if (state.phase === "run" && !paused) inputRef.current?.focus();
  }, [state.phase, paused]);

  useEffect(() => {
    if (!state.last) return;
    setLastVisible(true);
    const id = window.setTimeout(() => setLastVisible(false), SHOW_LAST);
    return () => clearTimeout(id);
  }, [state.answered, state.last]);

  const submit = () => {
    if (paused) return;
    const s = ref.current;
    const next = answer(s, input);
    if (next === s) return;
    setInput("");
    save(next);
    if (sound && next.last?.ok) tone(660, 110, "sine", 0.04);
  };

  const begin = () => {
    if (paused) return;
    const s = ref.current;
    if (s.phase === "ready") save(start(s));
    else if (s.phase === "over") save(start(newRound(s.level, s.r)));
    setInput("");
  };

  const setLevel = (level: Level) => {
    if (paused || ref.current.phase === "run") return;
    save(newRound(level, ref.current.r));
  };

  const show = (text: string) => text.replace("{of}", tr("of"));
  const secs = Math.ceil(state.left / 1000);
  const pct = (state.left / ROUND_MS) * 100;

  return (
    <div className={`msprint${reducedMotion ? " still" : ""}`}>
      <div className="msprint-top">
        <span className="msprint-stat"><small>{tr("time")}</small><strong>{secs}</strong></span>
        <span className="msprint-stat"><small>{tr("score")}</small><strong>{state.score}</strong></span>
        {best != null && <span className="msprint-stat"><small>{tr("best")}</small><strong>{best}</strong></span>}
      </div>
      <div className="msprint-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>

      {state.phase !== "run" && (
        <div className="msprint-levels">
          <span className="muted small">{tr("level")}</span>
          <div className="segmented-sm" role="radiogroup" aria-label={tr("level")}>
            {LEVELS.map((l) => (
              <button key={l} className={state.level === l ? "on" : ""} role="radio" aria-checked={state.level === l} onClick={() => setLevel(l)} disabled={paused}>
                S{l}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.phase === "ready" && (
        <div className="msprint-card">
          <p className="muted">{tr("ready")}</p>
          <button className="btn primary" onClick={begin} disabled={paused} autoFocus>{tr("start")}</button>
        </div>
      )}

      {state.phase === "run" && (
        <form
          className="msprint-card"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="msprint-q" aria-live="polite">{show(state.q.text)}</div>
          <div className="row msprint-input">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value.replace(/[^\d\-−.,]/g, ""))}
              inputMode="numeric"
              autoComplete="off"
              aria-label={tr("answer")}
              placeholder={tr("answer")}
              disabled={paused}
            />
            <button className="btn primary" type="submit" disabled={paused}>{tr("submit")}</button>
          </div>
          <div className={`msprint-last small${lastVisible && state.last ? " on" : ""}`} role="status">
            {state.last && (state.last.ok
              ? <span className="ok">✓ {tr("right")}</span>
              : <span className="miss">✗ {tr("wrong", { q: show(state.last.text).replace("   x = ?", ", x"), a: num(state.last.answer) })}</span>)}
          </div>
        </form>
      )}

      {state.phase === "over" && (
        <div className="msprint-card">
          <p role="status"><strong>{tr("over", { n: state.score, m: state.answered })}</strong></p>
          <button className="btn primary" onClick={begin} disabled={paused} autoFocus>{tr("again")}</button>
        </div>
      )}
    </div>
  );
}
