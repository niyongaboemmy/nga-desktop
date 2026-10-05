import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, CalendarCheck, Clock, ExternalLink, MapPin, RefreshCw, WifiOff } from "lucide-react";
import { native, type DesktopApp } from "../../lib/native";
import { misCall, MisApiError } from "../shared/api";
import { usePersonal } from "../shared/store";
import { toolsNative } from "../shared/native";
import { byDay, hhmm, kigaliDay, KIND_COLOR, linkTarget, nowNext, until, type Agenda, type AgendaItem } from "./agenda";
import type { ToolProps } from "../types";
import type { Translate } from "../i18n";

const DAYS = 7;

export default function MyDay({ ctx }: ToolProps) {
  const { t, identity, lang, present } = ctx;
  const [cache, setCache, ready] = usePersonal<{ at: number; agenda: Agenda } | null>(identity, "myday.cache", null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [apps, setApps] = useState<DesktopApp[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    misCall<Agenda>({ method: "GET", path: "/desktop/tools/agenda", query: { days: DAYS }, timeoutMs: 25_000 })
      .then((a) => a && setCache({ at: Date.now(), agenda: a }))
      .catch((e: MisApiError) => setError(e.message))
      .finally(() => setLoading(false));
  }, [setCache]);

  useEffect(() => {
    void native.shellInfo().then((i) => setApps(i.apps)).catch(() => undefined);
    load();
    const refresh = window.setInterval(load, 5 * 60_000);
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(tick);
    };
  }, [load]);

  const items = useMemo(() => cache?.agenda.items ?? [], [cache]);
  const groups = useMemo(() => byDay(items), [items]);
  const today = kigaliDay(now);
  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < DAYS; i++) out.push(kigaliDay(now + i * 86_400_000));
    return out;
  }, [now]);
  const shown = day ?? today;
  const { current, next } = nowNext(items, now);

  const open = (it: AgendaItem) => {
    const target = linkTarget(it.link, apps);
    if (!target) return;
    void native.navigate(target.key, target.path).then(() => native.overlayHide());
  };
  const countdown = (it: AgendaItem) => {
    const ms = Date.parse(it.start) - Date.now();
    if (ms < 60_000) return;
    void toolsNative.createTimer({ kind: "countdown", durationMs: ms, label: it.title.slice(0, 40) }).then(() => {
      setNotice(t("myday.timerSet", { title: it.title }));
      window.setTimeout(() => setNotice(null), 3000);
    });
  };
  const dayName = (d: string, i: number) =>
    i === 0 ? t("myday.today") : i === 1 ? t("myday.tomorrow") : new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === "rw" ? "rw-RW" : lang, { weekday: "short", day: "numeric" });

  if (!ready) return null;
  return (
    <div className={`myday${present ? " big" : ""}`}>
      <NowNext current={current} next={next} now={now} t={t} />
      <div className="myday-bar">
        <div className="chips scroll" role="tablist">
          {days.map((d, i) => (
            <button key={d} role="tab" aria-selected={shown === d} className={`chip${shown === d ? " on" : ""}`} onClick={() => setDay(d)}>
              {dayName(d, i)}
              {(groups.get(d)?.length ?? 0) > 0 && <span className="chip-count">{groups.get(d)!.length}</span>}
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={load} disabled={loading} title={t("myday.refresh")} aria-label={t("myday.refresh")}>
          <RefreshCw size={15} className={loading ? "spin" : ""} />
        </button>
      </div>
      {error && (
        <p className="myday-stale" role="status">
          <WifiOff size={13} /> {cache ? t("myday.offline", { time: new Date(cache.at).toLocaleTimeString(lang === "rw" ? "rw-RW" : lang, { hour: "2-digit", minute: "2-digit" }) }) : error}
        </p>
      )}
      {notice && <p className="myday-notice" role="status"><BellRing size={13} /> {notice}</p>}
      <Timeline items={groups.get(shown) ?? []} now={now} today={shown === today} t={t} apps={apps} onOpen={open} onCountdown={countdown} loading={loading && !cache} />
    </div>
  );
}

function NowNext({ current, next, now, t }: { current: AgendaItem | null; next: AgendaItem | null; now: number; t: Translate }) {
  if (!current && !next) return null;
  const left = (ms: number) => {
    const u = until(ms);
    return u.h > 0 ? t("myday.inHM", { h: u.h, m: String(u.m).padStart(2, "0") }) : t("myday.inM", { m: u.m });
  };
  return (
    <div className="nownext">
      {current && (
        <div className="nn-card now" style={{ ["--c" as string]: current.color || KIND_COLOR[current.kind] || "var(--accent)" }}>
          <span className="nn-label">{t("myday.now")}</span>
          <strong>{current.title}</strong>
          <span className="muted small">{hhmm(current.start)}–{current.end ? hhmm(current.end) : ""} · {t("myday.ends", { when: left(Date.parse(current.end!) - now) })}</span>
          <span className="nn-bar"><span style={{ width: `${Math.min(100, ((now - Date.parse(current.start)) / (Date.parse(current.end!) - Date.parse(current.start))) * 100)}%` }} /></span>
        </div>
      )}
      {next && (
        <div className="nn-card" style={{ ["--c" as string]: next.color || KIND_COLOR[next.kind] || "var(--accent)" }}>
          <span className="nn-label">{t("myday.next")}</span>
          <strong>{next.title}</strong>
          <span className="muted small">{hhmm(next.start)} · {left(Date.parse(next.start) - now)}{next.location ? ` · ${next.location}` : ""}</span>
        </div>
      )}
    </div>
  );
}

function Timeline({ items, now, today, t, apps, onOpen, onCountdown, loading }: {
  items: AgendaItem[]; now: number; today: boolean; t: Translate; apps: DesktopApp[];
  onOpen: (it: AgendaItem) => void; onCountdown: (it: AgendaItem) => void; loading: boolean;
}) {
  if (loading) return <div className="tool-loading"><RefreshCw size={18} className="spin" /></div>;
  if (!items.length)
    return (
      <div className="empty myday-empty">
        <CalendarCheck size={26} className="muted" />
        <p><strong>{today ? t("myday.freeToday") : t("myday.free")}</strong></p>
        <p className="muted small">{t("myday.freeHint")}</p>
      </div>
    );
  return (
    <ol className="timeline">
      {items.map((it) => {
        const past = (it.end ? Date.parse(it.end) : Date.parse(it.start)) < now;
        const live = Date.parse(it.start) <= now && !!it.end && now < Date.parse(it.end);
        const target = linkTarget(it.link, apps);
        const color = it.color || KIND_COLOR[it.kind] || "var(--accent)";
        return (
          <li key={it.key} className={`tl-item${past ? " past" : ""}${live ? " live" : ""}`} style={{ ["--c" as string]: color }}>
            <span className="tl-time">
              <strong>{hhmm(it.start)}</strong>
              {it.end && <span>{hhmm(it.end)}</span>}
            </span>
            <span className="tl-bar" />
            <div className="tl-body">
              <div className="tl-title">
                <strong>{it.title}</strong>
                <span className="tl-kind">{t(`myday.kind.${it.kind}` as never) || it.kind}</span>
                {it.critical && !past && <span className="tl-flag">!</span>}
              </div>
              {(it.detail || it.location) && (
                <div className="muted small tl-meta">
                  {it.detail}
                  {it.location && <span><MapPin size={11} /> {it.location}</span>}
                </div>
              )}
              <div className="tl-actions">
                {target && <button onClick={() => onOpen(it)}><ExternalLink size={12} /> {t("myday.open")}</button>}
                {!past && Date.parse(it.start) - now > 60_000 && <button onClick={() => onCountdown(it)}><Clock size={12} /> {t("myday.countdown")}</button>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
