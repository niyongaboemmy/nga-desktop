import { useEffect, useRef, useState } from "react";
import { BookOpen, RotateCcw } from "lucide-react";
import { fromScreen, g, legalPits, move, newGame, screenPos, variantId, type Frame, type Player, type State } from "./logic";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

let audio: AudioContext | null = null;
function beep(freq: number, ms = 45) {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const gn = audio.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    gn.gain.setValueAtTime(0.05, audio.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms / 1000);
    o.connect(gn).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + ms / 1000);
  } catch {
    /* no audio */
  }
}

function Seeds({ n }: { n: number }) {
  return (
    <span className="igi-seeds" aria-hidden="true">
      {Array.from({ length: Math.min(n, 12) }, (_, i) => <i key={i} />)}
    </span>
  );
}

export default function Game({ saved, save, paused, tr, finish, sound, reducedMotion, variant }: GameProps<State>) {
  const vid = variantId(variant);
  // The approved variant wins: a game saved under another variant starts again.
  const state = saved && saved.variant === vid ? saved : newGame(vid);
  const ref = useRef(state);
  ref.current = state;
  useEffect(() => {
    if (state !== saved) save(state);
  }, [saved, save, state]);

  const [cursor, setCursor] = useState(() => legalPits(state)[0] ?? 0);
  const [showRules, setShowRules] = useState(false);
  const [anim, setAnim] = useState<{ frames: Frame[]; i: number } | null>(null);

  // Step through the sowing; stopped (jumps to the end) when paused or unmounted.
  useEffect(() => {
    if (!anim) return;
    if (paused || anim.i >= anim.frames.length - 1) {
      setAnim(null);
      return;
    }
    const delay = Math.max(30, Math.min(160, 6000 / anim.frames.length));
    const t = setTimeout(() => {
      const f = anim.frames[anim.i + 1];
      if (sound) beep(f.kind === "capture" ? 220 : f.kind === "lift" ? 330 : 520 + (f.at % 8) * 20);
      setAnim({ ...anim, i: anim.i + 1 });
    }, delay);
    return () => clearTimeout(t);
  }, [anim, paused, sound]);

  const s = state;
  const busy = !!anim;
  const legal = s.winner === -1 ? legalPits(s) : [];
  const name = (p: Player) => tr(p === 0 ? "playerA" : "playerB");

  const sow = (pit: number) => {
    if (paused || busy) return;
    const cur = ref.current;
    const { state: next, frames } = move(cur, pit);
    if (next === cur) return;
    ref.current = next;
    save(next);
    if (!reducedMotion && frames.length > 1) setAnim({ frames, i: 0 });
    else if (sound) beep(next.last?.captured ? 220 : 520, 90);
    setCursor(legalPits(next)[0] ?? 0);
    if (next.winner !== -1) finish({ won: true });
  };

  const restart = () => {
    if (paused) return;
    const fresh = newGame(vid);
    ref.current = fresh;
    setAnim(null);
    setCursor(legalPits(fresh)[0] ?? 0);
    save(fresh);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || paused) return;
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      const p = ref.current.turn;
      let [row, col] = screenPos(p, cursor);
      const rows = p === 0 ? [2, 3] : [0, 1];
      if (e.key === "ArrowLeft") col = Math.max(0, col - 1);
      else if (e.key === "ArrowRight") col = Math.min(7, col + 1);
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") row = row === rows[0] ? rows[1] : rows[0];
      else if ((e.key === "Enter" || e.key === " ") && !(e.target as HTMLElement)?.closest("button")) {
        e.preventDefault();
        if (busy) setAnim(null);
        else sow(cursor);
        return;
      } else return;
      e.preventDefault();
      setCursor(fromScreen(row, col)[1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const frame = anim ? anim.frames[anim.i] : null;
  const pits = frame ? frame.pits : s.pits;
  const last = s.last;
  const startCell = last ? g(last.player, last.pit) : -1;
  const status = s.winner !== -1 && !busy ? tr("wins", { name: name(s.winner) }) : tr("turn", { name: name(busy && last ? last.player : s.turn) });

  return (
    <div className={`igi${reducedMotion ? " still" : ""}`}>
      <div className="igi-top">
        <p className={`igi-status p${s.winner !== -1 ? s.winner : s.turn}`} role="status"><i />{status}</p>
        <span className="chip">{tr("variant", { name: tr(`v.${vid}`) })}</span>
        <button className="btn sm" onClick={() => setShowRules((v) => !v)} aria-expanded={showRules}><BookOpen size={14} />{tr(showRules ? "hideRules" : "rules")}</button>
        <button className="btn sm" onClick={restart}><RotateCcw size={14} />{tr("newGame")}</button>
      </div>
      <div className="igi-board" role="grid" onClick={() => busy && setAnim(null)}>
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className={`igi-row r${row}${row === 1 ? " mid" : ""}`} role="row">
            {Array.from({ length: 8 }, (_, col) => {
              const [p, i] = fromScreen(row, col);
              const gi = g(p, i);
              const n = pits[gi];
              const mine = !busy && s.winner === -1 && p === s.turn;
              const canPlay = mine && legal.includes(i);
              const cls = [
                "igi-pit",
                `p${p}`,
                mine ? "turn" : "",
                canPlay ? "legal" : "",
                mine && i === cursor ? "cursor" : "",
                frame?.at === gi ? `hot ${frame.kind}` : "",
                !busy && gi === startCell ? "from" : "",
                !busy && last?.captures.includes(gi) ? "took" : "",
              ].filter(Boolean).join(" ");
              return (
                <button
                  key={col}
                  className={cls}
                  role="gridcell"
                  disabled={!canPlay || paused}
                  onClick={(e) => { e.stopPropagation(); setCursor(i); sow(i); }}
                  aria-label={tr("pit", { name: name(p), n })}
                >
                  <Seeds n={n} />
                  <b>{n || ""}</b>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="small muted igi-last">
        {busy ? <>{frame && frame.hand > 0 && <span className="igi-hand">{tr("seeds", { n: frame.hand })}</span>}<button className="btn sm" onClick={() => setAnim(null)}>{tr("skip")}</button></>
          : last ? tr(last.captured ? "lastCapture" : "lastMove", { name: name(last.player), n: last.captured || last.seeds }) : " "}
      </p>
      {showRules && <p className="igi-rules small">{tr(`r.${vid}`)}</p>}
    </div>
  );
}
