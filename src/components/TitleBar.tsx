import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDownCircle, ArrowLeft, ArrowRight, Bell, Ellipsis, Keyboard, Minimize2, Moon, RotateCw, Search, Settings as Gear, Sun, Video, WifiOff } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { native, type AppKey, type DesktopApp, type NoticeSummary } from "../lib/native";
import type { Views } from "../lib/appState";
import type { Theme, ThemePref } from "../lib/theme";
import { isMac, mod } from "../lib/platform";

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

      <nav className="tabs" ref={tabs} aria-label="NGA apps">
        {pill && <span className="tab-pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />}
        {p.apps.map((a, i) => {
          const current = p.page === "app" && a.key === p.active;
          const badge = badgeFor(a.key, p.notices);
          const ready = p.views[a.key]?.status === "ready";
          return (
            <button
              key={a.key}
              data-key={a.key}
              className={`tab${current ? " current" : ""}${ready ? " ready" : ""}`}
              style={{ ["--app" as string]: a.color }}
              onClick={() => p.onOpen(a.key)}
              onContextMenu={(e) => {
                e.preventDefault();
                void native.popupMenu("tab", e.clientX, e.clientY, a.key);
              }}
              title={`${a.name}${p.views[a.key]?.title && p.views[a.key]?.title !== a.name ? ` — ${p.views[a.key]?.title}` : `: ${a.description}`}  (${mod}${i + 1})`}
              aria-current={current ? "page" : undefined}
            >
              <span className="tab-icon">
                <img src={`/apps/${a.key}.png`} alt="" />
                {badge !== 0 && <span key={badge} className="badge pop">{badge > 0 ? (badge > 99 ? "99+" : badge) : ""}</span>}
              </span>
              {!p.compact && <span className="tab-name">{a.name}</span>}
            </button>
          );
        })}
      </nav>

      <div className="drag" data-tauri-drag-region />

      <button className="search-pill" onClick={p.onPalette} title={`Search NGA (${mod}K)`}>
        <Search size={14} />
        {!p.compact && <span>Search or jump to…</span>}
        <kbd>{mod}K</kbd>
      </button>

      <div className="drag small" data-tauri-drag-region />

      {!p.online && (
        <span className="offline-pill" title="No internet connection. Apps reconnect on their own.">
          <WifiOff size={13} /> Offline
        </span>
      )}

      {session && (
        <span className="session-pill" title="Banners from the other apps wait until you finish">
          <Video size={13} /> {session.key === "tupo" ? "In a meeting" : "Quiz in progress"}
        </span>
      )}

      <div className="tools">
        <button disabled={!onApp} onClick={() => native.back()} title={`Back (${mod}[)`}><ArrowLeft size={16} /></button>
        <button disabled={!onApp} onClick={() => native.forward()} title={`Forward (${mod}])`}><ArrowRight size={16} /></button>
        <button disabled={!onApp} onClick={() => native.reload()} title={`Reload (${mod}R)`} className={view?.busy ? "spin" : ""}>
          <RotateCw size={15} />
        </button>
        <span className="sep" />
        {p.updateVersion && (
          <button
            className="update-pill"
            onClick={p.onUpdate}
            disabled={p.updatePct !== null}
            title={`Update to NGA ${p.updateVersion} now (NGA restarts)`}
          >
            <ArrowDownCircle size={14} /> {p.updatePct === null ? "Update" : `Updating ${p.updatePct}%`}
          </button>
        )}
        <button className={`bell${p.panelOpen ? " on" : ""}`} onClick={p.onPanel} title="Notifications">
          <Bell size={16} />
          {(p.notices?.total ?? 0) > 0 && <span key={p.notices?.total} className="badge pop">{p.notices!.total > 99 ? "99+" : p.notices!.total}</span>}
        </button>
        <button
          onClick={(e) => { const { x, y } = at(e); void native.popupMenu("theme", x, y, p.themePref); }}
          title="Appearance"
        >
          {p.theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <button onClick={p.onShortcuts} title={`Keyboard shortcuts (${mod}/)`}>
          <Keyboard size={16} />
        </button>
        <button onClick={(e) => { const { x, y } = at(e); void native.popupMenu("more", x, y); }} title="More">
          <Ellipsis size={16} />
        </button>
        <button className={p.page === "settings" ? "on" : ""} onClick={p.onSettings} title={`Settings (${mod},)`}>
          <Gear size={16} />
        </button>
      </div>

      {!isMac && <WindowControls />}
      {onApp && view?.busy && <div className="progress" />}
    </header>
  );
}

/** Slim bar in focus mode: just enough to know where you are and get out. */
export function FocusBar({ app, onExit }: { app: DesktopApp | null; onExit: () => void }) {
  return (
    <header className={`titlebar focus${isMac ? " mac" : " win"}`} data-tauri-drag-region>
      {isMac && <div className="lights" data-tauri-drag-region />}
      <span className="focus-name" data-tauri-drag-region>{app?.name}</span>
      <div className="drag" data-tauri-drag-region />
      <button className="exit-focus" onClick={onExit} title={`Exit focus mode (${mod}⇧F)`}>
        <Minimize2 size={13} /> Exit focus
      </button>
      {!isMac && <WindowControls />}
    </header>
  );
}

function WindowControls() {
  const w = getCurrentWindow();
  return (
    <div className="winctl">
      <button onClick={() => w.minimize()} aria-label="Minimise">
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" /></svg>
      </button>
      <button onClick={() => w.toggleMaximize()} aria-label="Maximise">
        <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" /></svg>
      </button>
      <button className="close" onClick={() => w.close()} aria-label="Close">
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" /></svg>
      </button>
    </div>
  );
}
