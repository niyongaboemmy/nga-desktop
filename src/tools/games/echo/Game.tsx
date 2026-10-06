import { useEffect, useRef, useState } from "react";
import { begin, newGame, press, replay, shown, type State } from "./logic";
import { tone } from "./sound";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

/** Each pad: its own colour, shape, corner and number, so colour is never the only clue. */
const PAD_INFO = [
  { name: "green", freq: 330 },
  { name: "red", freq: 392 },
  { name: "yellow", freq: 494 },
  { name: "blue", freq: 587 },
] as const;

/** A constant, gentle pace (ms). */
const LEAD = 700, ON = 520, OFF = 260;

function Shape({ i }: { i: number }) {
  const common = { fill: "currentColor" };
  return (
    <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
      {i === 0 && <circle cx="20" cy="20" r="16" {...common} />}
      {i === 1 && <polygon points="20,4 37,35 3,35" {...common} />}
      {i === 2 && <rect x="5" y="5" width="30" height="30" rx="3" {...common} />}
      {i === 3 && <polygon points="20,2 38,20 20,38 2,20" {...common} />}
    </svg>
  );
}

export default function Game({ saved, save, paused, seed, tr, finish, sound, reducedMotion, best }: GameProps<State>) {
  const state = saved ?? newGame(seed);
  const ref = useRef(state);
  ref.current = state;
  useEffect(() => {
    if (!saved) save(state);
  }, [saved, save, state]);

  const [lit, setLit] = useState<number | null>(null);
  const flash = (pad: number, ms: number) => {
    setLit(pad);
    if (sound) tone(PAD_INFO[pad].freq, ms, "sine");
  };

  // The computer plays the sequence; paused stops it (it plays again from the start on resume).
  useEffect(() => {
    if (state.phase !== "show" || paused) return;
    const timers: number[] = [];
    state.seq.forEach((pad, i) => {
      const at = LEAD + i * (ON + OFF);
      timers.push(window.setTimeout(() => flash(pad, ON), at));
      timers.push(window.setTimeout(() => setLit(null), at + ON));
    });
    timers.push(window.setTimeout(() => save(shown(ref.current)), LEAD + state.seq.length * (ON + OFF)));
    return () => {
      timers.forEach(clearTimeout);
      setLit(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.seq.length, paused]);

  const tap = (pad: number) => {
    if (paused) return;
    const s = ref.current;
    if (s.phase !== "input") return;
    const next = press(s, pad);
    if (next.phase === "over") {
      setLit(null);
      if (sound) tone(196, 380, "triangle", 0.05);
    } else {
      flash(pad, 200);
      window.setTimeout(() => setLit((l) => (l === pad ? null : l)), 200);
    }
    save(next);
    if (next.phase === "over") finish({ score: next.score, better: "high" });
  };

  const startOrAgain = () => {
    if (paused) return;
    const s = ref.current;
    if (s.phase === "ready") save(begin(s));
    else if (s.phase === "over") save(begin(newGame(s.r)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.closest("input, textarea")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) {
        e.preventDefault();
        tap(n - 1);
      } else if ((e.key === "Enter" || e.key === " ") && (ref.current.phase === "ready" || ref.current.phase === "over")) {
        if ((e.target as HTMLElement)?.closest("button")) return; // the focused button handles it
        e.preventDefault();
        startOrAgain();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const left = state.seq.length - state.pos;
  return (
    <div className={`echo${reducedMotion ? " still" : ""}`}>
      <div className="echo-top">
        <span className="echo-score"><small>{tr("score")}</small><strong>{state.score}</strong></span>
        {best != null && <span className="echo-score"><small>{tr("best")}</small><strong>{best}</strong></span>}
        <span className="echo-status small" role="status" aria-live="polite">
          {state.phase === "show" && tr("watch")}
          {state.phase === "input" && tr("yourTurn", { n: left })}
          {state.phase === "over" && tr("over", { n: state.score })}
        </span>
      </div>
      <div className={`echo-board${state.phase === "input" ? " live" : ""}`}>
        {PAD_INFO.map((p, i) => (
          <button
            key={p.name}
            className={`echo-pad p${i}${lit === i ? " lit" : ""}${state.phase === "over" && state.missed === i ? " missed" : ""}${state.phase === "over" && state.seq[state.pos] === i ? " wanted" : ""}`}
            onClick={() => tap(i)}
            disabled={state.phase !== "input" || paused}
            aria-label={`${tr("pad", { n: i + 1 })}: ${tr(p.name)}`}
          >
            <Shape i={i} />
            <span className="echo-num">{i + 1}</span>
          </button>
        ))}
      </div>
      <div className="echo-actions">
        {state.phase === "ready" && <button className="btn primary" onClick={startOrAgain} disabled={paused}>{tr("start")}</button>}
        {state.phase === "over" && <button className="btn primary" onClick={startOrAgain} disabled={paused}>{tr("again")}</button>}
        {state.phase === "input" && <button className="btn sm" onClick={() => !paused && save(replay(ref.current))} disabled={paused}>{tr("replay")}</button>}
      </div>
    </div>
  );
}
