import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play, RotateCcw } from "lucide-react";
import { canTurn, H, newGame, speed, tick, W, type Dir, type State } from "./logic";
import { step } from "../seed";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

const KEYS: Record<string, Dir> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
};

let audio: AudioContext | null = null;
function beep(freq: number, ms = 70) {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.05, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms / 1000);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + ms / 1000);
  } catch {
    /* no audio */
  }
}

export default function Game({ saved, save, paused, seed, tr, finish, sound, reducedMotion, best }: GameProps<State>) {
  const state = saved ?? newGame(seed);
  const ref = useRef(state);
  ref.current = state;
  useEffect(() => {
    if (!saved) save(state);
  }, [saved, save, state]);

  // Running is not saved: a restored game waits for a key, so nobody is surprised.
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const queue = useRef<Dir[]>([]);
  // When the shell pauses (help open, window hidden), stay stopped until the player is back.
  useEffect(() => {
    if (paused) setRunning(false);
  }, [paused]);

  const steer = (d: Dir) => {
    if (paused || ref.current.over) return;
    const q = queue.current;
    const last = q.length ? q[q.length - 1] : ref.current.dir;
    if (q.length < 2 && d !== last && canTurn(last, d)) q.push(d);
    setStarted(true);
    setRunning(true);
  };

  // The loop: one step per `speed` ms, stopped while paused, stopped or unmounted.
  useEffect(() => {
    if (!running || paused || state.over) return;
    const t = setTimeout(() => {
      const s = ref.current;
      const next = tick(s, queue.current.shift() ?? s.dir);
      ref.current = next;
      save(next);
      if (next.eaten > s.eaten && sound) beep(560 + Math.min(next.eaten, 20) * 12);
      if (next.over) {
        setRunning(false);
        if (sound) beep(260, 260);
        finish({ score: next.snake.length, better: "high", won: next.won || undefined });
      }
    }, speed(state));
    return () => clearTimeout(t);
  }, [running, paused, state, save, sound, finish]);

  const restart = (wrap = ref.current.wrap) => {
    if (paused) return;
    const [, r] = step(ref.current.r ^ 0x27d4eb2f);
    const fresh = newGame(r, wrap);
    ref.current = fresh;
    queue.current = [];
    setRunning(false);
    setStarted(false);
    save(fresh);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || paused) return;
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      const d = KEYS[e.key];
      if (d) steer(d);
      else if (e.key === "p" || e.key === "P") {
        if (!ref.current.over && started) setRunning((r) => !r);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const s = state;
  const cells = new Map<number, string>();
  s.snake.forEach((c, i) => cells.set(c, i === 0 ? "head" : "body"));
  if (s.food >= 0) cells.set(s.food, "food");
  const message = s.over
    ? tr(s.won ? "full" : "over", { n: s.snake.length })
    : !started ? tr("start") : !running ? tr("paused") : "";

  return (
    <div className={`snk${reducedMotion ? " still" : ""}`}>
      <div className="snk-top">
        <span className="snk-score"><small>{tr("length")}</small><strong>{s.snake.length}</strong></span>
        {best != null && <span className="snk-score"><small>{tr("best")}</small><strong>{best}</strong></span>}
        <label className="snk-walls small">
          <input type="checkbox" checked={s.wrap} onChange={(e) => { const n = { ...ref.current, wrap: e.target.checked }; ref.current = n; save(n); }} />
          {tr("walls")}
        </label>
      </div>
      <div className={`snk-grid${s.wrap ? " soft" : ""}`} style={{ gridTemplateColumns: `repeat(${W}, 1fr)` }} role="img" aria-label={`${tr("length")} ${s.snake.length}`}>
        {Array.from({ length: W * H }, (_, i) => {
          const k = cells.get(i);
          return <span key={i} className={k ? `snk-${k}${k === "head" ? ` d-${s.dir}` : ""}` : undefined} />;
        })}
        {message && <div className={`snk-msg${s.over ? " end" : ""}`} role="status">{message}</div>}
      </div>
      <div className="snk-controls">
        <div className="snk-pad">
          <button className="icon-btn" onClick={() => steer("left")} aria-label={tr("left")}><ArrowLeft size={18} /></button>
          <button className="icon-btn" onClick={() => steer("up")} aria-label={tr("up")}><ArrowUp size={18} /></button>
          <button className="icon-btn" onClick={() => steer("down")} aria-label={tr("down")}><ArrowDown size={18} /></button>
          <button className="icon-btn" onClick={() => steer("right")} aria-label={tr("right")}><ArrowRight size={18} /></button>
        </div>
        {started && !s.over && (
          <button className="btn sm" onClick={() => !paused && setRunning((r) => !r)}>
            {running ? <><Pause size={14} />{tr("pause")}</> : <><Play size={14} />{tr("resume")}</>}
          </button>
        )}
        <button className={`btn sm${s.over ? " primary" : ""}`} onClick={() => restart()}><RotateCcw size={14} />{tr("newGame")}</button>
      </div>
    </div>
  );
}
