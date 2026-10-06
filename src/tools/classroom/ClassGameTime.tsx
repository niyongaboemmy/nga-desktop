import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { LoaderCircle, PartyPopper, RefreshCw, Square } from "lucide-react";
import { misCall } from "../shared/api";
import { useClassLists } from "./roster";
import { GAMES } from "../games/catalog";
import type { ToolProps } from "../types";
import type { Key } from "../i18n";

interface Running {
  id: number;
  classGroupId: number;
  className: string;
  games: string[];
  endsAt: string;
  by: string;
}

const MINUTES = [5, 10, 15, 20, 30];
const CHOICES = GAMES.filter((g) => g.kind !== "reset" && g.id !== "igisoro");
const DEFAULT = ["math-sprint", "pairs", "word-search", "five-letter"];

/**
 * Class game time (plan §6.7.5 layer 6): open chosen games for one of your classes
 * for 5–30 minutes, even during your lesson — a reward, a brain break, an end-of-term
 * treat. Students see it within a minute; exams still lock games; it doesn't count
 * towards their daily time.
 */
export default function ClassGameTime({ ctx }: ToolProps) {
  const { t, identity } = ctx;
  const { lists, loading, error: listError, refresh } = useClassLists(identity);
  const classes = useMemo(() => lists.filter((l) => l.source === "mis"), [lists]);
  const [classId, setClassId] = useState<string>("");
  const [games, setGames] = useState<string[]>(DEFAULT);
  const [minutes, setMinutes] = useState(10);
  const [running, setRunning] = useState<Running[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!classId && classes[0]) setClassId(classes[0].id);
  }, [classes, classId]);

  const load = useCallback(() => {
    misCall<{ active: Running[] }>({ method: "GET", path: "/desktop/tools/class-game-time", timeoutMs: 20_000 })
      .then((d) => d && setRunning(d.active))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    const a = window.setInterval(load, 30_000);
    const b = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(a);
      window.clearInterval(b);
    };
  }, [load]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await misCall({ method: "POST", path: "/desktop/tools/class-game-time", body: { classGroupId: Number(classId.replace("mis-", "")), games, minutes }, timeoutMs: 20_000 });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const end = async (id: number) => {
    try {
      await misCall({ method: "POST", path: `/desktop/tools/class-game-time/${id}/end`, timeoutMs: 20_000 });
    } catch (e) {
      setError((e as Error).message);
    }
    load();
  };

  const live = running.filter((r) => Date.parse(r.endsAt) > now);
  const toggle = (id: string) => setGames((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  const left = (r: Running) => {
    const s = Math.max(0, Math.floor((Date.parse(r.endsAt) - now) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <div className="cgt">
      {live.length > 0 && (
        <ul className="cgt-live" aria-live="polite">
          {live.map((r) => (
            <li key={r.id}>
              <PartyPopper size={18} />
              <div>
                <strong>{t("cgt.running", { class: r.className })}</strong>
                <span className="muted small">{r.games.map((g) => t(`game.${g}` as Key)).join(" · ")}</span>
              </div>
              <span className="cgt-left">{t("cgt.left", { time: left(r) })}</span>
              <button className="btn sm" onClick={() => void end(r.id)}><Square size={12} /> {t("cgt.end")}</button>
            </li>
          ))}
        </ul>
      )}

      {loading && classes.length === 0 ? (
        <div className="tool-loading"><LoaderCircle size={20} className="spin" /></div>
      ) : classes.length === 0 ? (
        <div className="empty">
          <p><strong>{t("cgt.noClasses")}</strong></p>
          {listError && <p className="muted small">{listError}</p>}
          <button className="btn sm" onClick={refresh}><RefreshCw size={13} /> {t("cgt.retry")}</button>
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="cgt-class">{t("cgt.class")}</label>
            <select id="cgt-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.people.length})</option>)}
            </select>
          </div>
          <div className="field">
            <span className="cgt-label">{t("cgt.games")}</span>
            <div className="cgt-games" role="group" aria-label={t("cgt.games")}>
              {CHOICES.map((g) => (
                <button
                  key={g.id}
                  className={`cgt-game${games.includes(g.id) ? " on" : ""}`}
                  style={{ "--tile": g.color } as CSSProperties}
                  aria-pressed={games.includes(g.id)}
                  onClick={() => toggle(g.id)}
                >
                  <g.icon size={14} /> {t(`game.${g.id}` as Key)}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="cgt-label">{t("cgt.minutes")}</span>
            <div className="segmented-sm" role="group">
              {MINUTES.map((m) => (
                <button key={m} className={minutes === m ? "on" : ""} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>{t("timer.min", { n: m })}</button>
              ))}
            </div>
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <button className="btn primary" disabled={busy || !classId || games.length === 0} onClick={() => void start()}>
            <PartyPopper size={15} /> {t("cgt.start", { n: minutes })}
          </button>
          <p className="muted small">{t("cgt.note")}</p>
        </>
      )}
    </div>
  );
}
