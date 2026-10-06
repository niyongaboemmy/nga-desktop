import { useEffect, useRef } from "react";
import { Delete, RotateCcw } from "lucide-react";
import { addPeg, LEVELS, newGame, removePeg, submit, TRIES, type Level, type State } from "./logic";
import { step } from "../seed";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

/** Own palette; every colour also has a shape and a number (colour-blind friendly). */
const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#7c3aed", "#0891b2", "#78716c"];
const SHAPES = [
  <circle cx="12" cy="12" r="10.5" />,
  <rect x="2" y="2" width="20" height="20" rx="3" />,
  <path d="M12 1.5 L23 21.5 H1 Z" />,
  <path d="M12 0.5 L23.5 12 L12 23.5 L0.5 12 Z" />,
  <path d="M6 2 H18 L23.5 12 L18 22 H6 L0.5 12 Z" />,
  <path d="M12 0.8 L15 8 L23 8.6 L16.9 13.8 L18.8 22 L12 17.6 L5.2 22 L7.1 13.8 L1 8.6 L9 8 Z" />,
  <path d="M8 1.5 H16 V8 H22.5 V16 H16 V22.5 H8 V16 H1.5 V8 H8 Z" />,
];

function Peg({ c, size = 30 }: { c: number; size?: number }) {
  return (
    <svg className="cb-peg" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <g fill={COLORS[c]}>{SHAPES[c]}</g>
      <text x="12" y="13" textAnchor="middle" dominantBaseline="middle">{c + 1}</text>
    </svg>
  );
}

let audio: AudioContext | null = null;
function beep(freq: number, ms = 90) {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.06, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms / 1000);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + ms / 1000);
  } catch {
    /* no audio: play silently */
  }
}

export default function Game({ saved, save, paused, seed, tr, finish, sound, reducedMotion }: GameProps<State>) {
  const state = saved ?? newGame(seed);
  const ref = useRef(state);
  ref.current = state;
  useEffect(() => {
    if (!saved) save(state);
  }, [saved, save, state]);

  const apply = (next: State) => {
    const s = ref.current;
    if (next === s) return;
    ref.current = next;
    save(next);
    if (next.guesses.length > s.guesses.length) {
      const g = next.guesses[next.guesses.length - 1];
      if (sound) beep(next.won ? 880 : 300 + g.exact * 120);
      if (next.over) finish(next.won ? { won: true, score: next.guesses.length, better: "low" } : { won: false });
    } else if (sound) beep(520, 50);
  };
  const act = (f: (s: State) => State) => {
    if (!paused) apply(f(ref.current));
  };
  const restart = (level: Level = ref.current.level) => {
    if (paused) return;
    const [, nextSeed] = step(ref.current.seed ^ 0x9e3779b9);
    const fresh = newGame(nextSeed, level);
    ref.current = fresh;
    save(fresh);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= 7) act((s) => addPeg(s, n - 1));
      else if (e.key === "Backspace") act(removePeg);
      else if (e.key === "Enter" && !(e.target as HTMLElement)?.closest("button")) act(submit);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const s = state;
  const rows = Array.from({ length: TRIES }, (_, i) => i);
  return (
    <div className={`cb${reducedMotion ? " still" : ""}`}>
      <div className="cb-board" role="list">
        {rows.map((i) => {
          const g = s.guesses[i];
          const live = !s.over && i === s.guesses.length;
          const code = g ? g.code : live ? s.current : [];
          return (
            <div key={i} className={`cb-row${live ? " live" : ""}${g ? " done" : ""}`} role="listitem" aria-current={live || undefined}>
              <span className="cb-n">{i + 1}</span>
              <span className="cb-pegs">
                {Array.from({ length: s.pegs }, (_, j) =>
                  code[j] !== undefined ? <Peg key={j} c={code[j]} size={26} /> : <span key={j} className="cb-hole" />,
                )}
              </span>
              <span className="cb-fb" aria-label={g ? tr("feedback", { exact: g.exact, near: g.near }) : undefined} title={g ? tr("feedback", { exact: g.exact, near: g.near }) : undefined}>
                {g && Array.from({ length: s.pegs }, (_, j) => (
                  <i key={j} className={j < g.exact ? "x" : j < g.exact + g.near ? "o" : ""} />
                ))}
              </span>
            </div>
          );
        })}
      </div>
      <div className="cb-side">
        <div className="segmented-sm" role="tablist">
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <button key={l} className={s.level === l ? "on" : ""} role="tab" aria-selected={s.level === l} onClick={() => s.level !== l && restart(l)}>
              {tr(l)}
            </button>
          ))}
        </div>
        {!s.over && <p className="small muted" role="status">{tr("tries", { n: s.guesses.length + 1, tries: TRIES })}</p>}
        {s.over && (
          <div className="cb-end" role="status">
            {s.won ? <strong>{tr("won", { n: s.guesses.length })}</strong> : <span>{tr("lost")}</span>}
            {!s.won && <span className="cb-pegs">{s.secret.map((c, j) => <Peg key={j} c={c} size={26} />)}</span>}
          </div>
        )}
        <div className="cb-palette">
          {Array.from({ length: s.colors }, (_, c) => (
            <button key={c} className="cb-pick" onClick={() => act((x) => addPeg(x, c))} disabled={s.over || s.current.length >= s.pegs} aria-label={tr("color", { n: c + 1 })} title={`${c + 1}`}>
              <Peg c={c} size={30} />
            </button>
          ))}
        </div>
        <div className="row cb-actions">
          <button className="btn sm" onClick={() => act(removePeg)} disabled={s.over || !s.current.length}><Delete size={15} />{tr("undo")}</button>
          <button className="btn sm primary" onClick={() => act(submit)} disabled={s.over || s.current.length !== s.pegs}>{tr("check")}</button>
        </div>
        <p className="small muted cb-legend"><i className="x" /><i className="o" /> {tr("legend")}</p>
        <button className="btn sm" onClick={() => restart()}><RotateCcw size={14} />{tr("newGame")}</button>
      </div>
    </div>
  );
}
