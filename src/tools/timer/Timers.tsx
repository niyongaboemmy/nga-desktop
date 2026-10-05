import { useState } from "react";
import { Flag, Pause, Play, Plus, RotateCcw, Timer as StopwatchIcon, Trash2 } from "lucide-react";
import { toolsNative, type Timer } from "../shared/native";
import { useTimers } from "../shared/timers";
import { clock, elapsed, parseLength, PRESETS_MIN, progress, remaining } from "./format";
import { Ring } from "./Ring";
import type { ToolProps } from "../types";
import type { Translate } from "../i18n";

export default function Timers({ ctx }: ToolProps) {
  const { t, present } = ctx;
  const { timers, now } = useTimers();
  const list = timers.filter((x) => x.kind !== "focus");
  const [error, setError] = useState<string | null>(null);

  const create = async (kind: "countdown" | "stopwatch", durationMs?: number, label?: string) => {
    setError(null);
    try {
      await toolsNative.createTimer({ kind, durationMs, label });
    } catch (e) {
      setError(String(e));
    }
  };

  if (present) return <PresentTimer list={list} now={now} t={t} />;

  return (
    <div className="timers">
      <NewTimer t={t} onCreate={create} />
      {error && <p className="field-error" role="alert">{error}</p>}
      {list.length === 0 ? (
        <p className="muted small timers-empty">{t("timer.empty")}</p>
      ) : (
        <ul className="timer-list">
          {[...list].reverse().map((x) => <TimerCard key={x.id} timer={x} now={now} t={t} />)}
        </ul>
      )}
      <p className="muted small">{t("timer.keepsRunning")}</p>
    </div>
  );
}

function NewTimer({ t, onCreate }: { t: Translate; onCreate: (k: "countdown" | "stopwatch", ms?: number, label?: string) => void }) {
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const ms = parseLength(text);
  return (
    <div className="new-timer">
      <div className="chips">
        {PRESETS_MIN.map((m) => (
          <button key={m} className="chip" onClick={() => { onCreate("countdown", m * 60_000, label.trim()); setLabel(""); }}>{t("timer.min", { n: m })}</button>
        ))}
      </div>
      <form
        className="new-timer-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (ms) { onCreate("countdown", ms, label.trim()); setText(""); setLabel(""); }
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("timer.lengthHint")} aria-label={t("timer.length")} className={text && !ms ? "bad" : ""} />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("timer.label")} aria-label={t("timer.label")} maxLength={40} />
        <button className="btn sm primary" type="submit" disabled={!ms}><Plus size={14} /> {t("timer.start")}</button>
      </form>
      <button className="btn sm" onClick={() => { onCreate("stopwatch", undefined, label.trim()); setLabel(""); }}><StopwatchIcon size={14} /> {t("timer.stopwatch")}</button>
    </div>
  );
}

const act = (id: number, a: Parameters<typeof toolsNative.timerAction>[1]) => void toolsNative.timerAction(id, a).catch(() => undefined);

function tone(x: Timer, now: number): "accent" | "warn" | "danger" | "ok" {
  if (x.kind === "stopwatch") return "ok";
  if (x.finishedAt) return "danger";
  return remaining(x, now) <= 60_000 ? "warn" : "accent";
}

function TimerCard({ timer: x, now, t }: { timer: Timer; now: number; t: Translate }) {
  const running = x.runningSince !== null;
  const done = x.finishedAt !== null;
  const sw = x.kind === "stopwatch";
  return (
    <li className={`timer-card${done ? " done" : ""}`}>
      <Ring value={sw ? (elapsed(x, now) % 60_000) / 60_000 : progress(x, now)} size={92} stroke={7} tone={tone(x, now)}>
        <span className="timer-clock">{sw ? clock(elapsed(x, now), false, true) : clock(remaining(x, now), true)}</span>
      </Ring>
      <div className="timer-meta">
        <strong>{x.label || (sw ? t("timer.stopwatch") : t("timer.countdown"))}</strong>
        <span className="muted small">
          {done ? t("timer.done") : sw ? (running ? t("timer.running") : t("timer.paused")) : `${clock(x.durationMs)} · ${running ? t("timer.running") : t("timer.paused")}`}
        </span>
        <div className="timer-actions">
          {!done && (running
            ? <button className="icon-btn" onClick={() => act(x.id, "pause")} title={t("timer.pause")} aria-label={t("timer.pause")}><Pause size={15} /></button>
            : <button className="icon-btn" onClick={() => act(x.id, "resume")} title={t("timer.resume")} aria-label={t("timer.resume")}><Play size={15} /></button>)}
          {sw && running && <button className="icon-btn" onClick={() => act(x.id, "lap")} title={t("timer.lap")} aria-label={t("timer.lap")}><Flag size={15} /></button>}
          <button className="icon-btn" onClick={() => act(x.id, "restart")} title={t("timer.restart")} aria-label={t("timer.restart")}><RotateCcw size={15} /></button>
          <button className="icon-btn" onClick={() => act(x.id, "delete")} title={t("timer.delete")} aria-label={t("timer.delete")}><Trash2 size={15} /></button>
        </div>
        {sw && x.laps.length > 0 && (
          <ol className="laps">
            {x.laps.map((l, i) => <li key={i}><span className="muted">{t("timer.lapN", { n: i + 1 })}</span> {clock(l - (x.laps[i - 1] ?? 0), false, true)} <span className="muted">({clock(l, false, true)})</span></li>).reverse()}
          </ol>
        )}
      </div>
    </li>
  );
}

/** Projector view: the newest timer, huge, with a text cue (not colour only). */
function PresentTimer({ list, now, t }: { list: Timer[]; now: number; t: Translate }) {
  const [pick, setPick] = useState<number | null>(null);
  const x = list.find((y) => y.id === pick) ?? [...list].reverse().find((y) => y.runningSince !== null) ?? list[list.length - 1];
  if (!x) return <div className="present-empty"><p>{t("timer.presentEmpty")}</p></div>;
  const sw = x.kind === "stopwatch";
  const left = remaining(x, now);
  const status = x.finishedAt ? t("timer.timesUp") : sw ? "" : left <= 60_000 ? t("timer.lastMinute") : "";
  return (
    <div className={`present-timer tone-${tone(x, now)}`}>
      {x.label && <div className="present-label">{x.label}</div>}
      <div className="present-clock" aria-live="off">{sw ? clock(elapsed(x, now)) : clock(left, true)}</div>
      <div className="present-status" aria-live="polite">{status}</div>
      <div className="present-bar"><span style={{ width: `${(sw ? 0 : progress(x, now)) * 100}%` }} /></div>
      <div className="present-controls">
        {x.runningSince !== null
          ? <button onClick={() => act(x.id, "pause")}><Pause size={22} /> {t("timer.pause")}</button>
          : !x.finishedAt && <button onClick={() => act(x.id, "resume")}><Play size={22} /> {t("timer.resume")}</button>}
        <button onClick={() => act(x.id, "restart")}><RotateCcw size={22} /> {t("timer.restart")}</button>
        {list.length > 1 && (
          <select value={x.id} onChange={(e) => setPick(Number(e.target.value))} aria-label={t("timer.choose")}>
            {list.map((y) => <option key={y.id} value={y.id}>{y.label || (y.kind === "stopwatch" ? t("timer.stopwatch") : clock(y.durationMs))}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}
