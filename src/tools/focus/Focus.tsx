import { useEffect, useState } from "react";
import { BellOff, Coffee, Pause, Play, Square, Target } from "lucide-react";
import { toolsNative, type Timer } from "../shared/native";
import { useTimers } from "../shared/timers";
import { readPersonal, usePersonal } from "../shared/store";
import { clock, progress, remaining } from "../timer/format";
import { Ring } from "../timer/Ring";
import { Stepper } from "../shared/Stepper";
import type { ToolProps } from "../types";

interface Plan {
  workMin: number;
  breakMin: number;
  rounds: number;
}

const PLANS: Plan[] = [
  { workMin: 25, breakMin: 5, rounds: 4 },
  { workMin: 50, breakMin: 10, rounds: 2 },
  { workMin: 15, breakMin: 3, rounds: 4 },
];

interface Session {
  at: number;
  ms: number;
}

/** Minutes focused today (local day), from the sessions Rust records per person. */
export function focusedToday(sessions: Session[], now = new Date()): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round(sessions.filter((s) => s.at >= start).reduce((sum, s) => sum + s.ms, 0) / 60_000);
}

export default function Focus({ ctx }: ToolProps) {
  const { t, identity, present } = ctx;
  const { timers, now } = useTimers();
  const active = [...timers].reverse().find((x) => x.kind === "focus" && x.finishedAt === null) ?? null;
  const [plan, setPlan] = usePersonal<Plan>(identity, "focus.plan", PLANS[0]);
  const [label, setLabel] = useState("");
  const [today, setToday] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Rust adds a session to the person's file when a work phase ends.
  useEffect(() => {
    void readPersonal<Session[]>(identity, "focusSessions").then((s) => setToday(focusedToday(s ?? [])));
  }, [identity, timers]);

  const start = async () => {
    setError(null);
    try {
      await toolsNative.createTimer({ kind: "focus", label: label.trim(), workMs: plan.workMin * 60_000, breakMs: plan.breakMin * 60_000, rounds: plan.rounds });
    } catch (e) {
      setError(String(e));
    }
  };

  if (active) return <Running timer={active} now={now} t={t} present={present} />;
  if (present) return <div className="present-empty"><p>{t("focus.presentEmpty")}</p></div>;

  return (
    <div className="focus">
      <div className="focus-today">
        <Target size={18} />
        <span>{identity ? t("focus.today", { n: today }) : t("focus.todaySignedOut")}</span>
      </div>
      <div className="chips">
        {PLANS.map((p) => {
          const on = p.workMin === plan.workMin && p.breakMin === plan.breakMin && p.rounds === plan.rounds;
          return (
            <button key={p.workMin} className={`chip${on ? " on" : ""}`} onClick={() => setPlan(p)} aria-pressed={on}>
              {t("focus.plan", { w: p.workMin, b: p.breakMin })}
            </button>
          );
        })}
      </div>
      <div className="focus-grid">
        <div className="field"><span>{t("focus.work")}</span><Stepper label={t("focus.work")} value={plan.workMin} min={1} max={180} step={5} onChange={(v) => setPlan({ ...plan, workMin: v })} /></div>
        <div className="field"><span>{t("focus.break")}</span><Stepper label={t("focus.break")} value={plan.breakMin} min={1} max={60} onChange={(v) => setPlan({ ...plan, breakMin: v })} /></div>
        <div className="field"><span>{t("focus.rounds")}</span><Stepper label={t("focus.rounds")} value={plan.rounds} min={1} max={12} onChange={(v) => setPlan({ ...plan, rounds: v })} /></div>
      </div>
      <label className="field"><span>{t("focus.subject")}</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("focus.subjectHint")} maxLength={40} /></label>
      <button className="btn primary focus-start" onClick={() => void start()}><Play size={15} /> {t("focus.start")}</button>
      {error && <p className="field-error" role="alert">{error}</p>}
      <p className="muted small"><BellOff size={12} /> {t("focus.dndNote")}</p>
      <p className="muted small">{t("focus.evidence")}</p>
    </div>
  );
}

function Running({ timer: x, now, t, present }: { timer: Timer; now: number; t: ToolProps["ctx"]["t"]; present: boolean }) {
  const f = x.focus!;
  const work = f.phase === "work";
  const running = x.runningSince !== null;
  const act = (a: "pause" | "resume" | "delete") => void toolsNative.timerAction(x.id, a).catch(() => undefined);
  return (
    <div className={`focus-running${work ? " work" : " rest"}${present ? " big" : ""}`}>
      <div className="focus-phase">{work ? <Target size={18} /> : <Coffee size={18} />} {work ? t("focus.phaseWork") : t("focus.phaseBreak")}</div>
      {x.label && <div className="focus-label">{x.label}</div>}
      <Ring value={progress(x, now)} size={present ? 360 : 200} stroke={present ? 18 : 12} tone={work ? "accent" : "ok"}>
        <span className="focus-clock">{clock(remaining(x, now), true)}</span>
        <span className="muted small">{t("focus.round", { r: f.round, n: f.rounds })}</span>
      </Ring>
      <div className="row center">
        {running
          ? <button className="btn" onClick={() => act("pause")}><Pause size={15} /> {t("timer.pause")}</button>
          : <button className="btn primary" onClick={() => act("resume")}><Play size={15} /> {t("timer.resume")}</button>}
        <button className="btn" onClick={() => act("delete")}><Square size={14} /> {t("focus.stop")}</button>
      </div>
      <p className="muted small">{work ? t("focus.workTip") : t("focus.breakTip")}</p>
    </div>
  );
}
