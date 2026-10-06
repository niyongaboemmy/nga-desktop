import { useEffect, useRef } from "react";
import { Check, RotateCcw } from "lucide-react";
import { LESSONS, TEST_SECONDS, newState, stats, tick, type, type State, type TestLang } from "./logic";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

const ROWS: Record<"qwerty" | "azerty", string[]> = {
  qwerty: ["1234567890", "qwertyuiop", "asdfghjkl;", "zxcvbnm,.", " "],
  azerty: ["1234567890", "azertyuiop", "qsdfghjklm", "wxcvbn,.", " "],
};

export default function Game({ saved, save, paused, seed, tr, lang, finish }: GameProps<State>) {
  const state = saved ?? newState(seed, lang);
  const ref = useRef(state);
  ref.current = state;
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!saved) save(state);
  }, [saved, save, state]);

  // The clock starts at the first key and stops while paused.
  useEffect(() => {
    if (paused || state.done) return;
    const id = window.setInterval(() => {
      const s = ref.current;
      const next = tick(s);
      if (next === s) return;
      save(next);
      if (next.done && next.mode === "test") {
        const st = stats(next.target, next.typed, next.elapsed);
        finish({ score: st.wpm, better: "high" });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [paused, state.done, save, finish]);

  useEffect(() => {
    if (!paused && !state.done) input.current?.focus();
  }, [paused, state.done, state.target]);

  const onInput = (value: string) => {
    if (paused) return;
    const s = ref.current;
    const next = type(s, value.replace(/\n/g, " "));
    save(next);
    if (next.done && !s.done && next.mode === "lesson") {
      const st = stats(next.target, next.typed, Math.max(1, next.elapsed));
      finish({ won: st.accuracy >= 90 });
    }
  };

  const restart = (over: Partial<Pick<State, "mode" | "lesson" | "lang">>) => {
    const s = ref.current;
    save(newState((s.seed + 1 + s.typed.length) >>> 0, over.lang ?? s.lang, over.mode ?? s.mode, over.lesson ?? s.lesson, s.passed));
  };

  const st = stats(state.target, state.typed, Math.max(1, state.elapsed));
  const nextChar = state.target[state.typed.length] ?? "";
  const layout = state.mode === "test" && state.lang === "fr" ? "azerty" : "qwerty";
  // Show a window of the text around the caret (long speed-test texts).
  const from = Math.max(0, state.target.lastIndexOf(" ", Math.max(0, state.typed.length - 60)) + 1);
  const cut = state.target.length > from + 220 ? state.target.lastIndexOf(" ", from + 220) : state.target.length;
  const view = state.target.slice(from, cut > from ? cut : from + 220);

  return (
    <div className="tpg">
      <div className="tpg-bar">
        <div className="segmented-sm" role="group">
          <button className={state.mode === "lesson" ? "on" : ""} aria-pressed={state.mode === "lesson"} onClick={() => restart({ mode: "lesson" })}>{tr("lessons")}</button>
          <button className={state.mode === "test" ? "on" : ""} aria-pressed={state.mode === "test"} onClick={() => restart({ mode: "test" })}>{tr("test")}</button>
        </div>
        {state.mode === "lesson" ? (
          <select aria-label={tr("lessons")} value={state.lesson} onChange={(e) => restart({ lesson: Number(e.target.value) })}>
            {LESSONS.map((l, i) => <option key={l.id} value={i}>{state.passed.includes(i) ? "✓ " : ""}{i + 1}. {tr(l.id)}</option>)}
          </select>
        ) : (
          <select aria-label={tr("language")} value={state.lang} onChange={(e) => restart({ lang: e.target.value as TestLang })}>
            <option value="en">{tr("english")}</option>
            <option value="fr">{tr("french")}</option>
            <option value="rw">{tr("kinyarwanda")}</option>
          </select>
        )}
      </div>

      <div className="tpg-stats">
        <span><small>{tr("wpm")}</small><strong>{state.typed.length ? st.wpm : "—"}</strong></span>
        <span><small>{tr("accuracy")}</small><strong>{st.accuracy}%</strong></span>
        <span><small>{tr("time")}</small><strong>{state.mode === "test" ? Math.max(0, TEST_SECONDS - state.elapsed) : state.elapsed}s</strong></span>
      </div>

      <div className="tpg-text" onClick={() => input.current?.focus()} aria-label={state.target}>
        {[...view].map((c, k) => {
          const i = from + k;
          const cls = i < state.typed.length ? (state.typed[i] === c ? "ok" : "bad") : i === state.typed.length ? "cur" : "";
          return <span key={i} className={cls}>{c}</span>;
        })}
        <textarea
          ref={input}
          className="tpg-input"
          value={state.typed}
          onChange={(e) => onInput(e.target.value)}
          disabled={state.done}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label={tr("start")}
        />
        {!state.typed.length && !state.done && <span className="tpg-hint">{tr("focusHint")}</span>}
      </div>

      {state.done ? (
        <div className="tpg-done" role="status">
          {state.mode === "lesson" ? (st.accuracy >= 90 ? <><Check size={16} /> {tr("passed", { acc: st.accuracy, wpm: st.wpm })}</> : tr("tryAgain", { acc: st.accuracy })) : tr("result", { wpm: st.wpm, acc: st.accuracy })}
          <div className="row">
            <button className="btn sm" onClick={() => restart({})}><RotateCcw size={13} /> {tr("again")}</button>
            {state.mode === "lesson" && st.accuracy >= 90 && state.lesson < LESSONS.length - 1 && (
              <button className="btn sm primary" onClick={() => restart({ lesson: state.lesson + 1 })}>{tr("next")}</button>
            )}
          </div>
        </div>
      ) : (
        <div className="tpg-kb" aria-hidden>
          {ROWS[layout].map((row, r) => (
            <div key={r} className={`tpg-row r${r}`}>
              {[...row].map((k) => (
                <span key={k} className={`tpg-key${k === " " ? " space" : ""}${nextChar.toLowerCase() === k ? " next" : ""}${"fj".includes(k) ? " bump" : ""}`}>{k === " " ? "" : k}</span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
