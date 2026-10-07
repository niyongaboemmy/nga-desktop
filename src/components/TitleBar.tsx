import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Bell, Ellipsis, Keyboard, LoaderCircle, Minimize2, Moon, RotateCw, Search, Settings as Gear, Sun, Video, WifiOff, Wrench } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { native, type AppKey, type DesktopApp, type NoticeSummary } from "../lib/native";
import type { Views } from "../lib/appState";
import type { Theme, ThemePref } from "../lib/theme";
import { isMac, mod } from "../lib/platform";
import { appDescription } from "../lib/palette";
import { useLang } from "../tools/i18n";
import { Tip } from "./Tip";

export type Page = "app" | "settings";

/** The number a tab shows: the app's own badge, or its unread notices; -1 = a dot. */
export const badgeFor = (key: AppKey, s: NoticeSummary | null): number => {
  if (!s) return 0;
  const own = s.badges[key] ?? 0;
  const unread = s.unread[key] ?? 0;
  if (own > 0 || unread > 0) return Math.max(own, unread);
  return own === -1 ? -1 : 0;
};

interface Props {
  apps: DesktopApp[];
  active: AppKey | null;
  page: Page;
  views: Views;
  notices: NoticeSummary | null;
  compact: boolean;
  theme: Theme;
  themePref: ThemePref;
  focusSession: AppKey | null;
  online: boolean;
  panelOpen: boolean;
  /** The Tools panel is open. */
  toolsOpen: boolean;
  toolsLabel: string;
  toolsHint: string;
  /** Timers running (a small dot on the Tools button). */
  timersRunning: number;
  onTools: () => void;
  /** A newer NGA is ready to install (shows the "Update" pill). */
  updateVersion: string | null;
  /** Download progress while updating (0-100), else null. */
  updatePct: number | null;
  onUpdate: () => void;
  onOpen: (key: AppKey) => void;
  onPalette: () => void;
  onShortcuts: () => void;
  onPanel: () => void;
  onSettings: () => void;
}

export function TitleBar(p: Props) {
  const { t } = useLang();
  const tabs = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const onApp = p.page === "app" && !!p.active;
  const view = p.active ? p.views[p.active] : undefined;
  const session = p.focusSession ? p.apps.find((a) => a.key === p.focusSession) : null;

  // The sliding highlight under the active tab.
  useLayoutEffect(() => {
    const el = tabs.current?.querySelector<HTMLElement>(`[data-key="${p.active}"]`);
    setPill(el && p.page === "app" ? { x: el.offsetLeft, w: el.offsetWidth } : null);
  }, [p.active, p.page, p.compact, p.apps]);

  const at = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: r.left, y: r.bottom + 4 };
  };

  return (
    <header className={`titlebar${isMac ? " mac" : " win"}`} data-tauri-drag-region>
      {isMac ? <div className="lights" data-tauri-drag-region /> : <img className="brand" src="/apps/mis.png" alt="NGA" />}

      <nav className="tabs" ref={tabs} aria-label={t("shell.tabs.label")}>
        {pill && <span className="tab-pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />}
        {p.apps.map((a, i) => {
          const current = p.page === "app" && a.key === p.active;
          const badge = badgeFor(a.key, p.notices);
          const ready = p.views[a.key]?.status === "ready";
          const page = p.views[a.key]?.title;
          return (
            <Tip key={a.key} label={a.name} hint={page && page !== a.name ? page : appDescription(a, t)} keys={`${mod}${i + 1}`}>
            <button
              data-key={a.key}
              className={`tab${current ? " current" : ""}${ready ? " ready" : ""}`}
              style={{ ["--app" as string]: a.color }}
              onClick={() => p.onOpen(a.key)}
              onContextMenu={(e) => {
                e.preventDefault();
                void native.popupMenu("tab", e.clientX, e.clientY, a.key);
              }}
              aria-current={current ? "page" : undefined}
            >
              <span className="tab-icon">
                <img src={`/apps/${a.key}.png`} alt="" />
                {badge !== 0 && <span key={badge} className="badge pop">{badge > 0 ? (badge > 99 ? "99+" : badge) : ""}</span>}
              </span>
              {!p.compact && <span className="tab-name">{a.name}</span>}
            </button>
            </Tip>
          );
        })}
      </nav>

      <div className="drag" data-tauri-drag-region />

      <Tip label={t("shell.search.label")} hint={t("shell.search.hint")} keys={`${mod}K`}>
        <button className="search-pill" onClick={p.onPalette}>
          <Search size={14} />
          {!p.compact && <span>{t("shell.search.placeholder")}</span>}
          <kbd>{mod}K</kbd>
        </button>
      </Tip>

      <div className="drag small" data-tauri-drag-region />

      {!p.online && (
        <span className="offline-pill" title={t("shell.offline.title")}>
          <WifiOff size={13} /> {t("shell.offline")}
        </span>
      )}

      {session && (
        <span className="session-pill" title={t("shell.session.title")}>
          <Video size={13} /> {session.key === "tupo" ? t("shell.session.meeting") : t("shell.session.quiz")}
        </span>
      )}

      <div className="tools">
        <Tip label={t("shell.nav.back")} keys={`${mod}[`}><button disabled={!onApp} onClick={() => native.back()}><ArrowLeft size={16} /></button></Tip>
        <Tip label={t("shell.nav.forward")} keys={`${mod}]`}><button disabled={!onApp} onClick={() => native.forward()}><ArrowRight size={16} /></button></Tip>
        <Tip label={t("shell.nav.reload")} hint={t("shell.nav.reloadHint")} keys={`${mod}R`}>
          <button disabled={!onApp} onClick={() => native.reload()} className={view?.busy ? "spin" : ""}>
            <RotateCw size={15} />
          </button>
        </Tip>
        <span className="sep" />
        {p.updateVersion && (
          <Tip label={t("shell.update.to", { version: p.updateVersion })} hint={t("shell.update.hint")}>
          <button
            className="update-pill"
            onClick={p.onUpdate}
            disabled={p.updatePct !== null}
            aria-label={p.updatePct === null ? t("shell.update.to", { version: p.updateVersion }) : t("shell.update.updating", { pct: p.updatePct })}
            style={p.updatePct === null ? undefined : ({ "--pct": `${p.updatePct}%` } as CSSProperties)}
          >
            {p.updatePct !== null && <span className="update-progress" />}
            {p.updatePct === null ? <span className="update-dot" /> : <LoaderCircle size={13} className="spin" />}
            <span>{p.updatePct === null ? t("shell.update.pill") : `${p.updatePct}%`}</span>
          </button>
          </Tip>
        )}
        <Tip label={p.toolsLabel} hint={p.timersRunning > 0 ? (p.timersRunning > 1 ? t("shell.timers.many", { n: p.timersRunning }) : t("shell.timers.one")) : p.toolsHint} keys={`${mod}⇧T`}>
          <button className={`tools-btn${p.toolsOpen ? " on" : ""}`} onClick={p.onTools} aria-pressed={p.toolsOpen}>
            <Wrench size={15} />
            {p.timersRunning > 0 && <span className="badge timer-dot" />}
          </button>
        </Tip>
        <Tip label={t("shell.notices.title")} hint={(p.notices?.total ?? 0) > 0 ? t("shell.notices.unread", { n: p.notices!.total }) : t("shell.notices.hint")} keys={`${mod}⇧N`}>
          <button className={`bell${p.panelOpen ? " on" : ""}`} onClick={p.onPanel}>
            <Bell size={16} />
            {(p.notices?.total ?? 0) > 0 && <span key={p.notices?.total} className="badge pop">{p.notices!.total > 99 ? "99+" : p.notices!.total}</span>}
          </button>
        </Tip>
        <Tip label={t("shell.appearance")} hint={t("shell.appearance.hint")} keys={`${mod}⇧L`}>
          <button onClick={(e) => { const { x, y } = at(e); void native.popupMenu("theme", x, y, p.themePref); }}>
            {p.theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </Tip>
        <Tip label={t("shell.shortcuts.title")} keys={`${mod}/`}>
          <button onClick={p.onShortcuts}>
            <Keyboard size={16} />
          </button>
        </Tip>
        <Tip label={t("shell.more")} hint={t("shell.more.hint")}>
          <button onClick={(e) => { const { x, y } = at(e); void native.popupMenu("more", x, y); }}>
            <Ellipsis size={16} />
          </button>
        </Tip>
        <Tip label={t("shell.settings.title")} keys={`${mod},`}>
          <button className={p.page === "settings" ? "on" : ""} onClick={p.onSettings}>
            <Gear size={16} />
          </button>
        </Tip>
      </div>

      {!isMac && <WindowControls />}
      {onApp && view?.busy && <div className="progress" />}
    </header>
  );
}

/** Slim bar in focus mode: just enough to know where you are and get out. */
export function FocusBar({ app, onExit }: { app: DesktopApp | null; onExit: () => void }) {
  const { t } = useLang();
  return (
    <header className={`titlebar focus${isMac ? " mac" : " win"}`} data-tauri-drag-region>
      {isMac && <div className="lights" data-tauri-drag-region />}
      <span className="focus-name" data-tauri-drag-region>{app?.name}</span>
      <div className="drag" data-tauri-drag-region />
      <button className="exit-focus" onClick={onExit} title={t("shell.focus.exitTitle", { key: `${mod}⇧F` })}>
        <Minimize2 size={13} /> {t("shell.focus.exit")}
      </button>
      {!isMac && <WindowControls />}
    </header>
  );
}

function WindowControls() {
  const w = getCurrentWindow();
  const { t } = useLang();
  return (
    <div className="winctl">
      <button onClick={() => w.minimize()} aria-label={t("shell.win.minimise")}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" /></svg>
      </button>
      <button onClick={() => w.toggleMaximize()} aria-label={t("shell.win.maximise")}>
        <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" /></svg>
      </button>
      <button className="close" onClick={() => w.close()} aria-label={t("shell.win.close")}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" /></svg>
      </button>
    </div>
  );
}
