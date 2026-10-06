import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { faceUp, flip, hide, newGame, waiting, type Size, type State } from "./logic";
import { SETS, SET_IDS, label, type ShapeId } from "./sets";
import { tone } from "./sound";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

const SIZES: Size[] = [12, 16, 20];

function Shape({ id, color }: { id: ShapeId; color: string }) {
  const p = { fill: color };
  const paths: Record<ShapeId, ReactElement> = {
    circle: <circle cx="20" cy="20" r="15" {...p} />,
    square: <rect x="6" y="6" width="28" height="28" rx="3" {...p} />,
    triangle: <polygon points="20,4 37,34 3,34" {...p} />,
    star: <polygon points="20,3 24.7,14.5 37,15.3 27.5,23.3 30.5,35.3 20,28.7 9.5,35.3 12.5,23.3 3,15.3 15.3,14.5" {...p} />,
    heart: <path d="M20 35 L6 21 A8 8 0 0 1 20 10 A8 8 0 0 1 34 21 Z" {...p} />,
    diamond: <polygon points="20,3 36,20 20,37 4,20" {...p} />,
    hexagon: <polygon points="11,5 29,5 38,20 29,35 11,35 2,20" {...p} />,
    pentagon: <polygon points="20,3 37,16 30,36 10,36 3,16" {...p} />,
    cross: <path d="M15 4h10v11h11v10H25v11H15V25H4V15h11z" {...p} />,
    ring: <circle cx="20" cy="20" r="12" fill="none" stroke={color} strokeWidth="7" />,
    crescent: <path d="M26 4 A16 16 0 1 0 26 36 A12 12 0 1 1 26 4 Z" {...p} />,
    arrow: <path d="M4 16h18V7l14 13-14 13v-9H4z" {...p} />,
  };
  return <svg viewBox="0 0 40 40" width="46" height="46" aria-hidden="true">{paths[id]}</svg>;
}

export default function Game({ saved, save, paused, seed, tr, lang, finish, sound, reducedMotion }: GameProps<State>) {
  const state = saved ?? newGame(seed);
  const ref = useRef(state);
  ref.current = state;
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    if (!saved) save(state);
  }, [saved, save, state]);

  // A quiet clock while playing.
  useEffect(() => {
    if (paused || state.done) return;
    const id = window.setInterval(() => save({ ...ref.current, elapsed: ref.current.elapsed + 1 }), 1000);
    return () => window.clearInterval(id);
  }, [paused, state.done, save]);

  // A mismatch stays visible for a moment, then turns back.
  // (Keyed on the open pair, not the whole state: the clock saves every second.)
  const openKey = waiting(state) ? state.open.join(",") : "";
  useEffect(() => {
    if (!openKey || paused) return;
    const id = window.setTimeout(() => save(hide(ref.current)), 950);
    return () => window.clearTimeout(id);
  }, [openKey, paused, save]);

  const play = (i: number) => {
    if (paused) return;
    const s = ref.current;
    const next = flip(s, i);
    if (next === s) return;
    save(next);
    if (sound) {
      const matchedNow = next.scores[0] + next.scores[1] > s.scores[0] + s.scores[1];
      tone(matchedNow ? 660 : waiting(next) ? 300 : 440, matchedNow ? 260 : 120);
    }
    if (next.done) finish(next.players === 1 ? { won: true, score: next.moves, better: "low" } : {});
  };

  const cols = state.cards.length <= 12 ? 4 : state.cards.length <= 16 ? 4 : 5;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest("input, textarea, select")) return;
      const n = ref.current.cards.length;
      const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
      if (e.key in moves) {
        e.preventDefault();
        setCursor((c) => Math.min(n - 1, Math.max(0, c + moves[e.key])));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        play(cursor);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const restart = (over: Partial<Pick<State, "set" | "size" | "players">>) => {
    const s = ref.current;
    save(newGame((seed + s.moves + s.elapsed + 1) >>> 0, over.set ?? s.set, over.size ?? s.size, over.players ?? s.players));
    setCursor(0);
  };

  const items = SETS[state.set];
  const status = state.done
    ? state.players === 1
      ? tr("won", { n: state.moves })
      : state.scores[0] === state.scores[1] ? tr("draw") : tr("winner", { n: state.scores[0] > state.scores[1] ? 1 : 2 })
    : state.players === 2 ? tr("turn", { n: state.turn + 1 }) : null;

  return (
    <div className={`prs${reducedMotion ? " still" : ""}`}>
      <div className="prs-bar">
        <div className="segmented-sm" role="group">
          {SET_IDS.map((id) => (
            <button key={id} className={state.set === id ? "on" : ""} aria-pressed={state.set === id} onClick={() => restart({ set: id })}>{tr(id)}</button>
          ))}
        </div>
        <div className="prs-row">
          <div className="segmented-sm" role="group">
            {SIZES.map((n) => (
              <button key={n} className={state.size === n ? "on" : ""} aria-pressed={state.size === n} onClick={() => restart({ size: n })}>{tr("cards", { n })}</button>
            ))}
          </div>
          <div className="segmented-sm" role="group">
            {([1, 2] as const).map((n) => (
              <button key={n} className={state.players === n ? "on" : ""} aria-pressed={state.players === n} onClick={() => restart({ players: n })}>{n === 1 ? tr("one") : tr("two")}</button>
            ))}
          </div>
          {state.players === 1 ? (
            <>
              <span className="prs-stat"><small>{tr("moves")}</small><strong>{state.moves}</strong></span>
              <span className="prs-stat"><small>{tr("time")}</small><strong>{Math.floor(state.elapsed / 60)}:{String(state.elapsed % 60).padStart(2, "0")}</strong></span>
            </>
          ) : (
            [0, 1].map((p) => (
              <span key={p} className={`prs-stat p${p}${state.turn === p && !state.done ? " on" : ""}`}><small>{tr("player", { n: p + 1 })}</small><strong>{state.scores[p]}</strong></span>
            ))
          )}
        </div>
      </div>
      {status && <p className="prs-status" role="status">{status}</p>}
      <div className="prs-grid" style={{ "--cols": cols } as CSSProperties} role="grid">
        {state.cards.map((c, i) => {
          const up = faceUp(state, i);
          const it = items[c.pair];
          const text = label(c.side === "a" ? it.a : it.b, lang);
          return (
            <button
              key={i}
              className={`prs-card${up ? " up" : ""}${state.matched[i] ? " done" : ""}${cursor === i ? " cur" : ""}${c.side === "b" && state.set !== "shapes" ? " b" : ""}`}
              onClick={() => { setCursor(i); play(i); }}
              aria-label={up ? text : `${tr("card", { n: i + 1 })}, ${tr("hidden")}`}
              aria-pressed={up}
            >
              {/* Only the visible side is drawn (3D back-face hiding is unreliable inside buttons on WebKit). */}
              {up ? (
                <span key="face" className="prs-face">
                  {it.shape ? <Shape id={it.shape.id} color={it.shape.color} /> : <span className={`prs-text${text.length > 12 ? " long" : ""}`}>{text}</span>}
                </span>
              ) : (
                <span key="back" className="prs-back" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
