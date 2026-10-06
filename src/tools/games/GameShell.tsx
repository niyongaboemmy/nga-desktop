// The frame every game runs in (plan §6.7.6): restores and saves the game, counts
// play time only while it is really being played (visible, focused, not idle),
// pauses it when a lock starts (lesson, exam, session cap…) and offers a reset.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, CircleHelp, LoaderCircle, Lock, RotateCcw, Trophy, Volume2, VolumeX } from "lucide-react";
import { usePersonal } from "../shared/store";
import { schoolHours, sessionLeft, type Gate } from "./gate";
import { dailySeed, freshSeed } from "./seed";
import { clock, hhmm, lockText } from "./text";
import type { GamesState } from "./useGames";
import type { GameDef, GameModule, GameResult } from "./types";
import type { ToolContext } from "../types";
import type { LucideIcon } from "lucide-react";

const IDLE_MS = 60_000;

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function GameShell({ def, games, ctx, onBack, onOpen }: {
  def: GameDef & { icon: LucideIcon };
  games: GamesState;
  ctx: ToolContext;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const { t, identity, lang } = ctx;
  const [mod, setMod] = useState<GameModule | null>(null);
  const [saved, setSaved, savedReady] = usePersonal<unknown>(identity, `games.save.${def.id}`, null);
  const [bests, setBests] = usePersonal<Record<string, number>>(identity, "games.best", {});
  const [seen, setSeen, seenReady] = usePersonal<string[]>(identity, "games.seen", []);
  const [soundPref, setSoundPref] = usePersonal<boolean | null>(identity, "games.sound", null);
  const [seed, setSeed] = useState(freshSeed);
  const [round, setRound] = useState(0);
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const lastInput = useRef(Date.now());
  // The counter below reads the latest state through a ref, so it never restarts.
  const gamesRef = useRef(games);
  gamesRef.current = games;

  useEffect(() => {
    let alive = true;
    void def.load().then((m) => alive && setMod(m));
    return () => {
      alive = false;
    };
  }, [def]);

  // The rules once, the first time someone opens a game.
  useEffect(() => {
    if (seenReady && !seen.includes(def.id)) {
      setHelp(true);
      setSeen((s) => [...s, def.id]);
    }
  }, [seenReady, seen, def.id, setSeen]);

  const gate: Gate = games.gate(def);
  const locked = !gate.open;
  const paused = locked || help || !active;

  // Is the game really being played? Checked every second; only then does time count.
  useEffect(() => {
    const onInput = () => (lastInput.current = Date.now());
    window.addEventListener("pointermove", onInput, { passive: true });
    window.addEventListener("pointerdown", onInput, { passive: true });
    window.addEventListener("keydown", onInput);
    const id = window.setInterval(() => {
      const el = root.current;
      const visible = document.visibilityState === "visible" && !!el && el.offsetParent !== null;
      const on = visible && document.hasFocus();
      setActive(on);
      const g = gamesRef.current;
      if (on && !help && g.gate(def).open && Date.now() - lastInput.current < IDLE_MS) g.count(def, 1);
    }, 1000);
    return () => {
      window.removeEventListener("pointermove", onInput);
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("keydown", onInput);
      window.clearInterval(id);
    };
  }, [def, help]);

  // Leaving a game sends its play time to NGA MIS straight away.
  const sync = games.sync;
  useEffect(() => () => void sync(), [sync]);

  const save = useCallback((s: unknown) => setSaved(s), [setSaved]);
  const tr = useMemo(() => {
    const d = mod?.strings[lang] ?? mod?.strings.en ?? {};
    return (key: string, vars?: Record<string, string | number>) => {
      let s = d[key] ?? mod?.strings.en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      return s;
    };
  }, [mod, lang]);

  const finish = useCallback(
    (r: GameResult) => {
      let msg: string | null = r.won ? t("games.wellDone") : null;
      if (typeof r.score === "number" && Number.isFinite(r.score)) {
        const prev = bests[def.id];
        const better = prev === undefined || (r.better === "low" ? r.score < prev : r.score > prev);
        if (better && (r.won !== false || r.better !== "low")) {
          setBests((b) => ({ ...b, [def.id]: r.score! }));
          if (prev !== undefined) msg = t("games.newBest");
        }
      }
      if (msg) {
        setToast(msg);
        window.setTimeout(() => setToast(null), 2600);
      }
    },
    [bests, def.id, setBests, t],
  );

  const newGame = () => {
    setSaved(null);
    setSeed(freshSeed());
    setRound((r) => r + 1);
  };

  const sound = soundPref ?? !schoolHours(games.now);
  const g = games.policy?.games;
  const student = identity?.persona === "student";
  const left = student && def.kind !== "reset" ? sessionLeft(games.usage.session, games.now, g?.sessionCapMin ?? 10, g?.cooldownMin ?? 5) : null;
  const best = bests[def.id] ?? null;

  return (
    <div className="game-shell" ref={root} style={{ "--game": def.color } as CSSProperties}>
      <div className="game-bar">
        <button className="icon-btn" onClick={onBack} aria-label={t("games.back")} title={t("games.back")}><ArrowLeft size={17} /></button>
        <span className="tile sm" style={{ "--tile": def.color } as CSSProperties}><def.icon size={15} /></span>
        <strong className="game-title">{t(`game.${def.id}` as never)}</strong>
        {best !== null && <span className="chip game-best"><Trophy size={12} /> {t("games.best", { n: best })}</span>}
        <span className="flex" />
        {left !== null && !locked && (
          <span className={`chip game-left${left < 60 ? " low" : ""}`} title={t("games.sessionLeft", { time: clock(left) })}>
            {t("games.sessionLeft", { time: clock(left) })}
          </span>
        )}
        <button className="icon-btn" onClick={() => setSoundPref(!sound)} aria-pressed={sound} aria-label={sound ? t("games.soundOn") : t("games.soundOff")} title={sound ? t("games.soundOn") : t("games.soundOff")}>
          {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <button className="icon-btn" onClick={() => setHelp(true)} aria-label={t("games.rules")} title={t("games.rules")}><CircleHelp size={16} /></button>
        {def.kind !== "reset" && !def.ownNewGame && <button className="btn sm" onClick={newGame}><RotateCcw size={13} /> {t("games.new")}</button>}
      </div>
      <div className="game-stage" aria-busy={!mod}>
        {!mod || !savedReady ? (
          <div className="tool-loading"><LoaderCircle size={20} className="spin" /></div>
        ) : (
          <mod.default
            key={`${def.id}-${round}`}
            saved={saved}
            save={save}
            paused={paused}
            dailySeed={dailySeed(def.id)}
            seed={seed}
            tr={tr}
            lang={lang}
            sound={sound}
            reducedMotion={reducedMotion()}
            finish={finish}
            variant={g?.igisoroVariant ?? null}
            best={best}
          />
        )}
        {locked && !gate.open && (
          <div className="game-veil" role="alertdialog" aria-live="assertive">
            <div className="game-veil-card">
              <Lock size={20} />
              <strong>{gate.reason === "cooldown" ? t("games.sessionDone") : t("games.paused")}</strong>
              <p>{gate.reason === "cooldown" ? t("games.sessionDoneHint", { time: hhmm(gate.until) }) : lockText(gate, def.id, t, games.usedMin)}</p>
              <div className="row">
                <button className="btn sm primary" onClick={() => onOpen("stretch")}>{t("game.stretch")}</button>
                <button className="btn sm" onClick={() => onOpen("breathe")}>{t("game.breathe")}</button>
                <button className="btn sm" onClick={onBack}>{t("games.back")}</button>
              </div>
            </div>
          </div>
        )}
        {help && mod && (
          <div className="game-veil" role="dialog" aria-label={t("games.rules")}>
            <div className="game-veil-card help">
              <CircleHelp size={20} />
              <strong>{t("games.rules")}</strong>
              <p>{tr("help")}</p>
              <button className="btn sm primary" autoFocus onClick={() => setHelp(false)}>{t("games.gotIt")}</button>
            </div>
          </div>
        )}
        {toast && <div className="game-toast" role="status">{toast}</div>}
      </div>
    </div>
  );
}
