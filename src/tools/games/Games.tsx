// Brain breaks: the games hub (plan §6.7). Short, finishable games and two reset
// activities, under the school's rules: games pause in the person's own lessons and
// exams, rest at night, and students have a daily budget and session cap.
import { useState, type CSSProperties } from "react";
import { CalendarDays, GraduationCap, Lock, PartyPopper, Trophy, Users } from "lucide-react";
import { usePersonal } from "../shared/store";
import { CATEGORIES, GAMES, findGame } from "./catalog";
import { GameShell } from "./GameShell";
import { sessionLeft } from "./gate";
import { clock, hhmm, lockText } from "./text";
import { useGames } from "./useGames";
import type { ToolProps } from "../types";
import "./hub.css";

/** Locks that apply to every game (shown once, as a banner). */
const GLOBAL = new Set(["stale", "exam", "lesson", "parent", "blocked", "off", "quiet", "budget", "cooldown"]);

export default function Games({ ctx }: ToolProps) {
  const { t, identity } = ctx;
  const games = useGames(identity);
  const [openId, setOpenId] = usePersonal<string | null>(identity, "games.open", null);
  const [bests] = usePersonal<Record<string, number>>(identity, "games.best", {});
  const [note, setNote] = useState<string | null>(null);
  const open = findGame(openId);

  if (!games.ready) return null;
  if (open) return <GameShell key={open.id} def={open} games={games} ctx={ctx} onBack={() => setOpenId(null)} onOpen={(id) => setOpenId(id)} />;

  const g = games.policy?.games;
  const student = identity?.persona === "student";
  const sample = games.gate({ id: GAMES[0].id, kind: "fun" });
  const banner = !sample.open && GLOBAL.has(sample.reason) ? sample : null;
  const cgt = g?.classGameTime && Date.parse(g.classGameTime.until) > games.now && student ? g.classGameTime : null;
  const budget = g?.dailyBudgetMin ?? null;
  const used = Math.min(Math.round(games.usedMin), budget ?? Infinity);
  const left = student && g ? sessionLeft(games.usage.session, games.now, g.sessionCapMin, g.cooldownMin) : null;

  const tryOpen = (id: string) => {
    const def = findGame(id)!;
    const gate = games.gate(def);
    if (gate.open) return setOpenId(id);
    setNote(lockText(gate, id, t, games.usedMin));
    window.setTimeout(() => setNote(null), 3500);
  };

  const card = (def: (typeof GAMES)[number]) => {
    const gate = games.gate(def);
    const best = bests[def.id];
    return (
      <li key={def.id}>
        <button className={`game-card${gate.open ? "" : " locked"}`} style={{ "--tile": def.color } as CSSProperties} onClick={() => tryOpen(def.id)} title={gate.open ? t(`game.${def.id}.desc` as never) : lockText(gate, def.id, t, games.usedMin)}>
          <span className="tile" style={{ "--tile": def.color } as CSSProperties}><def.icon size={19} /></span>
          <span className="game-card-text">
            <span className="game-card-name">{t(`game.${def.id}` as never)}{!gate.open && <Lock size={11} />}</span>
            <span className="game-card-desc">{t(`game.${def.id}.desc` as never)}</span>
            <span className="game-card-meta">
              <span>{def.minutes[0] === def.minutes[1] ? t("timer.min", { n: def.minutes[0] }) : t("games.minutes", { a: def.minutes[0], b: def.minutes[1] })}</span>
              {def.players !== "1" && <span><Users size={11} /> {def.players === "2" ? t("games.players2") : t("games.players12")}</span>}
              {def.daily && <span className="accent"><CalendarDays size={11} /> {t("games.daily")}</span>}
              {def.kind === "learning" && <span className="ok"><GraduationCap size={11} /> {t("games.learning")}</span>}
              {def.kind === "reset" && <span className="ok">{t("games.free")}</span>}
              {best !== undefined && <span><Trophy size={11} /> {best}</span>}
              {gate.open && gate.classTime && <span className="ok"><PartyPopper size={11} /> {t("games.classTimeBadge")}</span>}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="games">
      <div className="games-top">
        <div className="games-today">
          <span>{budget === null ? t("games.todayNoLimit", { used }) : t("games.today", { used, budget })}</span>
          {budget !== null && budget > 0 && (
            <span className="games-meter" role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={used}>
              <span style={{ width: `${Math.min(100, (used / budget) * 100)}%` }} />
            </span>
          )}
        </div>
        {left !== null && !banner && <span className="chip">{t("games.sessionLeft", { time: clock(left) })}</span>}
      </div>
      {banner && (
        <div className={`games-banner ${banner.reason}`} role="status">
          <Lock size={15} />
          <span>{banner.reason === "cooldown" ? t("games.sessionDoneHint", { time: hhmm(banner.until) }) : lockText(banner, "", t, games.usedMin)}</span>
        </div>
      )}
      {cgt && (
        <div className="games-banner class-time" role="status">
          <PartyPopper size={15} />
          <span>{t("games.classTime", { by: cgt.by || t("games.yourTeacher"), n: cgt.games.length, time: hhmm(Date.parse(cgt.until)) })}</span>
        </div>
      )}
      {note && <div className="games-banner" role="status"><Lock size={15} /><span>{note}</span></div>}
      <section>
        <h4>{t("games.takeBreak")}</h4>
        <ul className="games-grid reset">{GAMES.filter((d) => d.kind === "reset").map(card)}</ul>
      </section>
      {CATEGORIES.map((c) => {
        const list = GAMES.filter((d) => d.category === c);
        if (!list.length) return null;
        return (
          <section key={c}>
            <h4>{t(`games.cat.${c}` as never)}</h4>
            <ul className="games-grid">{list.map(card)}</ul>
          </section>
        );
      })}
      <p className="muted small games-foot">{t("games.offlineNote")}</p>
    </div>
  );
}
