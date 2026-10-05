import { useMemo, useState } from "react";
import { addDays, addWorkingDays, difference, parse, rwandaHolidays, today, weekday } from "./dates";
import type { ToolProps } from "../types";
import { Stepper } from "../shared/Stepper";

type Tab = "between" | "add" | "holidays";

export default function DateCalc({ ctx }: ToolProps) {
  const { t, lang } = ctx;
  const [tab, setTab] = useState<Tab>("between");
  const now = today();
  const [from, setFrom] = useState(now);
  const [to, setTo] = useState(addDays(now, 30) ?? now);
  const [start, setStart] = useState(now);
  const [n, setN] = useState(10);
  const [working, setWorking] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const nice = (d: string | null) => {
    if (!d || parse(d) === null) return "—";
    return new Date(`${d}T12:00:00`).toLocaleDateString(lang === "rw" ? "rw-RW" : lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };
  const diff = useMemo(() => difference(from, to), [from, to]);
  const added = working ? addWorkingDays(start, n) : addDays(start, n);
  const holidays = rwandaHolidays(year);

  return (
    <div className="dates">
      <div className="segmented-sm" role="tablist">
        {(["between", "add", "holidays"] as Tab[]).map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? "on" : ""} onClick={() => setTab(x)}>{t(`dates.tab.${x}` as never)}</button>
        ))}
      </div>

      {tab === "between" && (
        <>
          <div className="dates-row">
            <label className="field"><span>{t("dates.from")}</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="field"><span>{t("dates.to")}</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          {diff ? (
            <div className="result-cards">
              <div className="result-card big"><strong>{Math.abs(diff.days)}</strong><span>{t("dates.days")}</span></div>
              <div className="result-card"><strong>{diff.weeks}</strong><span>{t("dates.weeksDays", { d: diff.restDays })}</span></div>
              <div className="result-card"><strong>{diff.workingDays}</strong><span>{t("dates.workingDays")}</span></div>
              <div className="result-card"><strong>{diff.weekendDays + diff.holidays}</strong><span>{t("dates.daysOff", { w: diff.weekendDays, h: diff.holidays })}</span></div>
            </div>
          ) : <p className="field-error">{t("dates.bad")}</p>}
          <p className="muted small">{t("dates.workingNote")}</p>
        </>
      )}

      {tab === "add" && (
        <>
          <label className="field"><span>{t("dates.start")}</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <div className="dates-row">
            <div className="field"><span>{t("dates.count")}</span><Stepper label={t("dates.count")} value={n} min={-3650} max={3650} onChange={setN} /></div>
            <label className="switch-row compact">
              <input type="checkbox" className="switch" checked={working} onChange={(e) => setWorking(e.target.checked)} />
              <span>{t("dates.workingOnly")}</span>
            </label>
          </div>
          <div className="result-card big wide"><strong>{nice(added)}</strong><span className="muted">{added}</span></div>
          <div className="chips">
            {[7, 14, 30, 60, 90].map((d) => <button key={d} className="chip" onClick={() => { setN(d); setWorking(false); }}>+{d}</button>)}
          </div>
        </>
      )}

      {tab === "holidays" && (
        <>
          <div className="dates-row">
            <button className="btn sm" onClick={() => setYear(year - 1)} aria-label={t("dates.prevYear")}>‹</button>
            <strong className="dates-year">{year}</strong>
            <button className="btn sm" onClick={() => setYear(year + 1)} aria-label={t("dates.nextYear")}>›</button>
          </div>
          <ul className="holiday-list">
            {holidays.map((h) => (
              <li key={h.date + h.name} className={h.date < now ? "past" : ""}>
                <span className="holiday-date">{new Date(`${h.date}T12:00:00`).toLocaleDateString(lang === "rw" ? "rw-RW" : lang, { day: "numeric", month: "short" })}</span>
                <span className="holiday-name">{t(h.name)}{h.approximate ? " *" : ""}</span>
                <span className="muted small">{weekday(h.date, lang)}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">{t("dates.approxNote")}</p>
        </>
      )}
    </div>
  );
}
