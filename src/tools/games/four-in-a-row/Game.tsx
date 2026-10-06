import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { COLS, computerMove, computerToMove, drop, landing, newGame, over, ROWS, type Mode, type State } from "./logic";
import { step } from "../seed";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

let audio: AudioContext | null = null;
function beep(freq: number, ms = 80) {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.06, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms / 1000);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + ms / 1000);
  } catch {
    /* no audio */
  }
}

const MODES: Mode[] = ["two", "easy", "normal"];

export default function Game({ saved, save, paused, seed, tr, finish, sound, reducedMotion }: GameProps<State>) {
  const state = saved ?? newGame(seed);
  const ref = useRef(state);
  ref.current = state;
  useEffect(() => {
    if (!saved) save(state);
  }, [saved, save, state]);

  const [col, setCol] = useState(3);
  const [hover, setHover] = useState<number | null>(null);

  const apply = (next: State) => {
    const s = ref.current;
    if (next === s) return;
    ref.current = next;
    save(next);
    if (sound) beep(next.turn === 1 ? 330 : 440);
    if (over(next)) {
      if (sound) setTimeout(() => beep(next.draw ? 392 : 660, 220), 120);
      if (next.mode === "two") finish({});
      else finish({ won: next.winner === 1 });
    }
  };

  const play = (c: number) => {
    const s = ref.current;
    if (paused || over(s) || computerToMove(s)) return;
    apply(drop(s, c));
  };

  // The computer answers after a short beat; cancelled when paused or unmounted.
  const thinking = computerToMove(state);
  useEffect(() => {
    if (!thinking || paused) return;
    const t = setTimeout(() => apply(computerMove(ref.current)), reducedMotion ? 250 : 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thinking, paused, state]);

  const restart = (mode: Mode = ref.current.mode) => {
    if (paused) return;
    const [, r] = step(ref.current.r ^ 0x5bd1e995);
    const fresh = newGame(r, mode);
    ref.current = fresh;
    save(fresh);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || paused) return;
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowLeft") setCol((c) => (c + COLS - 1) % COLS);
      else if (e.key === "ArrowRight") setCol((c) => (c + 1) % COLS);
      else if (e.key === "ArrowDown" || ((e.key === "Enter" || e.key === " ") && !(e.target as HTMLElement)?.closest("button"))) play(col);
      else return;
      e.preventDefault();
      setHover(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const s = state;
  const name = (p: 1 | 2) => (s.mode === "two" ? tr(p === 1 ? "p1" : "p2") : tr(p === 1 ? "you" : "computer"));
  const shown = hover ?? col;
  const previewRow = !over(s) && !thinking ? landing(s.board, shown) : -1;
  const status = s.winner
    ? s.mode === "two" ? tr("wins", { name: name(s.winner) }) : s.winner === 1 ? tr("youWin") : tr("computerWins")
    : s.draw ? tr("draw") : thinking ? tr("thinking") : tr("turn", { name: name(s.turn) });

  return (
    <div className={`fr4${reducedMotion ? " still" : ""}`}>
      <div className="fr4-top">
        <div className="segmented-sm" role="tablist">
          {MODES.map((m) => (
            <button key={m} role="tab" aria-selected={s.mode === m} className={s.mode === m ? "on" : ""} onClick={() => s.mode !== m && restart(m)}>
              {tr(m)}
            </button>
          ))}
        </div>
        <button className="btn sm" onClick={() => restart()}><RotateCcw size={14} />{tr("newGame")}</button>
      </div>
      <p className={`fr4-status small p${over(s) ? s.winner : s.turn}`} role="status">
        {!s.draw && <i className={`fr4-chip p${s.winner || s.turn}`} />}
        {status}
      </p>
      <div className="fr4-board" role="grid" aria-label={status} onMouseLeave={() => setHover(null)}>
        {Array.from({ length: COLS }, (_, c) => (
          <button
            key={c}
            className={`fr4-col${c === shown && !over(s) ? " sel" : ""}`}
            onClick={() => { setCol(c); play(c); }}
            onMouseEnter={() => setHover(c)}
            disabled={paused || over(s) || thinking || landing(s.board, c) < 0}
            aria-label={tr("column", { n: c + 1 })}
          >
            {Array.from({ length: ROWS }, (_, r) => {
              const i = r * COLS + c;
              const v = s.board[i];
              const cls = [
                "fr4-cell",
                v ? `p${v}` : "",
                s.line.includes(i) ? "win" : "",
                s.last === i ? "last" : "",
                !v && c === shown && r === previewRow ? `ghost p${s.turn}` : "",
                over(s) && v && s.line.length && !s.line.includes(i) ? "dim" : "",
              ].filter(Boolean).join(" ");
              return <span key={r} className={cls} style={{ ["--r" as string]: r + 1 }} />;
            })}
          </button>
        ))}
      </div>
    </div>
  );
}
