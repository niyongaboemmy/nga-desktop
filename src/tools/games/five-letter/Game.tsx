import { useEffect, useRef, useState } from "react";
import { Delete } from "lucide-react";
import { erase, LENGTH, letterStates, marks, newGame, submit, TRIES, typeLetter, type Mark, type Mode, type State } from "./logic";
import { KEY_ROWS } from "./words";
import { tone } from "./sound";
import { hash } from "../seed";
import type { Lang } from "../../i18n";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

/** Symbols carry the meaning, colours only help: colour-blind players read the marks. */
const SYMBOL: Record<Mark, string> = { hit: "●", near: "○", miss: "–" };
const LANGS: Lang[] = ["en", "fr", "rw"];

export default function Game({ saved, save, paused, seed, dailySeed, lang, tr, finish, sound, reducedMotion }: GameProps<State>) {
  // An old daily word that was finished (or never started) gives way to today's.
  const stale = saved?.mode === "daily" && saved.seed !== dailySeed >>> 0 && (saved.over || saved.guesses.length === 0);
  const state = saved && !stale ? saved : newGame(saved?.lang ?? lang, "daily", dailySeed);
  const ref = useRef(state);
  ref.current = state;
  useEffect(() => {
    if (!saved || stale) save(state);
  }, [saved, stale, save, state]);

  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [state.guesses.length, state.lang, state.mode, state.seed]);

  const apply = (next: State) => {
    const s = ref.current;
    if (next === s) return;
    save(next);
    if (next.guesses.length > s.guesses.length) {
      if (next.won) {
        if (sound) tone(660, 180, "sine", 0.05);
        finish({ won: true, score: next.guesses.length, better: "low" });
      } else if (next.over) finish({ won: false });
    }
  };

  const press = (key: string) => {
    if (paused) return;
    const s = ref.current;
    if (key === "Enter") {
      if (!s.over && s.current.length < LENGTH) setNote(tr("short"));
      apply(submit(s));
    } else if (key === "Backspace") apply(erase(s));
    else apply(typeLetter(s, key));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "Enter" && (e.target as HTMLElement)?.closest("button")) return;
      if (e.key === "Enter" || e.key === "Backspace" || e.key.length === 1) {
        if (e.key === " ") return;
        e.preventDefault();
        press(e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const practiceSeed = () => hash(`${ref.current.seed}:${ref.current.guesses.join()}:${seed}:${Date.now()}`);
  const restart = (l: Lang, mode: Mode) => {
    if (paused) return;
    save(newGame(l, mode, mode === "daily" ? dailySeed : practiceSeed()));
  };

  const keys = letterStates(state);
  const rows = Array.from({ length: TRIES }, (_, i) => {
    if (i < state.guesses.length) return { word: state.guesses[i], m: marks(state.guesses[i], state.answer) };
    if (i === state.guesses.length && !state.over) return { word: state.current, m: null };
    return { word: "", m: null };
  });

  return (
    <div className={`fivel${reducedMotion ? " still" : ""}`}>
      <div className="fivel-bar">
        <div className="segmented-sm fivel-lang" role="radiogroup" aria-label={tr("language")}>
          {LANGS.map((l) => (
            <button key={l} role="radio" aria-checked={state.lang === l} className={state.lang === l ? "on" : ""} disabled={paused}
              onClick={() => state.lang !== l && restart(l, state.mode)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="segmented-sm fivel-mode" role="radiogroup">
          {(["daily", "practice"] as const).map((m) => (
            <button key={m} role="radio" aria-checked={state.mode === m} className={state.mode === m ? "on" : ""} disabled={paused}
              onClick={() => state.mode !== m && restart(state.lang, m)}>
              {tr(m)}
            </button>
          ))}
        </div>
        {state.mode === "practice" && (
          <button className="btn sm" onClick={() => restart(state.lang, "practice")} disabled={paused}>{tr("newWord")}</button>
        )}
      </div>

      <div className="fivel-board" role="grid" aria-label={tr("tries", { n: Math.min(state.guesses.length + 1, TRIES), max: TRIES })}>
        {rows.map((row, i) => (
          <div key={i} className={`fivel-row${i === state.guesses.length && !state.over ? " now" : ""}`} role="row">
            {Array.from({ length: LENGTH }, (_, j) => {
              const ch = row.word[j] ?? "";
              const m = row.m?.[j];
              return (
                <div key={j} className={`fivel-tile${m ? ` ${m}` : ""}${ch ? " filled" : ""}`} role="gridcell"
                  aria-label={m ? tr("letter", { l: ch.toUpperCase(), mark: tr(m) }) : ch.toUpperCase()}>
                  <span className="ch">{ch.toUpperCase()}</span>
                  {m && <span className="mk" aria-hidden="true">{SYMBOL[m]}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="fivel-msg small" role="status" aria-live="polite">
        {state.won && tr("won", { n: state.guesses.length })}
        {state.over && !state.won && tr("lost", { word: state.answer.toUpperCase() })}
        {state.over && state.mode === "daily" && <span className="muted"> {tr("dailyDone")}</span>}
        {!state.over && note}
      </div>

      <div className="fivel-keys">
        {KEY_ROWS[state.lang].map((row, r) => (
          <div key={r} className="fivel-krow">
            {r === KEY_ROWS[state.lang].length - 1 && (
              <button className="fivel-key wide" onClick={() => press("Enter")} disabled={paused || state.over}>{tr("enter")}</button>
            )}
            {[...row].map((k) => {
              const m = keys[k];
              return (
                <button key={k} className={`fivel-key${m ? ` ${m}` : ""}`} onClick={() => press(k)} disabled={paused || state.over}
                  aria-label={m ? tr("letter", { l: k.toUpperCase(), mark: tr(m) }) : k.toUpperCase()}>
                  {k.toUpperCase()}
                  {m && <span className="mk" aria-hidden="true">{SYMBOL[m]}</span>}
                </button>
              );
            })}
            {r === KEY_ROWS[state.lang].length - 1 && (
              <button className="fivel-key wide" onClick={() => press("Backspace")} disabled={paused || state.over} aria-label={tr("erase")}>
                <Delete size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
