import { useEffect, useMemo, useState } from "react";
import { Maximize2, Minimize2, Pin, PinOff, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { findTool, lockReason } from "./registry";
import { ToolHost } from "./ToolHost";
import { useIdentity } from "./shared/identity";
import { toolsNative } from "./shared/native";
import { useLang } from "./i18n";
import { restoreTheme } from "../lib/theme";
import { isMac } from "../lib/platform";

/**
 * A tool in its own window (index.html?tool=<id>[&present=1]): pop-out
 * (small, can stay on top) or present (full screen on a projector).
 */
export function ToolWindowApp({ toolId, present }: { toolId: string; present: boolean }) {
  const tool = findTool(toolId);
  const identity = useIdentity();
  const { lang, t } = useLang();
  const [onTop, setOnTop] = useState(!present);
  const [chrome, setChrome] = useState(true);
  const win = getCurrentWindow();

  // Follow the main window's theme (it writes localStorage; storage events reach us).
  useEffect(() => {
    const onStorage = () => restoreTheme();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (tool) void win.setTitle(`${t(tool.title)} · NGA`);
  }, [tool, t, win]);

  useEffect(() => {
    if (import.meta.env.VITE_NGA_SELFTEST === "1" && !present)
      void import("./selftest").then((m) => m.runWindowSelftest(win.label));
  }, [present, win]);

  // Present: Esc closes; the bar hides when the mouse rests.
  useEffect(() => {
    if (!present) return;
    let timer = window.setTimeout(() => setChrome(false), 2500);
    const wake = () => {
      setChrome(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setChrome(false), 2500);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && void win.close();
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", key);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", key);
    };
  }, [present, win]);

  const ctx = useMemo(() => ({ surface: "window" as const, present, identity, lang, t }), [present, identity, lang, t]);
  if (!tool) return <div className="tool-window"><p className="muted" style={{ padding: 20 }}>{t("host.unknown")}</p></div>;

  const pin = () => {
    const next = !onTop;
    setOnTop(next);
    void win.setAlwaysOnTop(next);
  };

  return (
    <div className={`tool-window${present ? " present" : ""}${chrome ? "" : " calm"}`}>
      <header className={`tool-window-bar${isMac ? " mac" : ""}`} data-tauri-drag-region>
        {isMac && !present && <span className="lights-sm" data-tauri-drag-region />}
        <tool.icon size={15} />
        <strong data-tauri-drag-region>{t(tool.title)}</strong>
        <span className="drag" data-tauri-drag-region />
        {!present && (
          <button onClick={pin} title={onTop ? t("window.unpin") : t("window.pin")} aria-pressed={onTop} aria-label={onTop ? t("window.unpin") : t("window.pin")}>
            {onTop ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
        )}
        {tool.present && !present && (
          <button onClick={() => void toolsNative.openWindow(tool.id, t(tool.title), true)} title={t("panel.present")} aria-label={t("panel.present")}>
            <Maximize2 size={14} />
          </button>
        )}
        {present ? (
          <button onClick={() => void win.close()} title={t("window.exitPresent")} aria-label={t("window.exitPresent")}><Minimize2 size={15} /></button>
        ) : (
          !isMac && <button className="close" onClick={() => void win.close()} title={t("panel.close")} aria-label={t("panel.close")}><X size={15} /></button>
        )}
      </header>
      <main className="tool-window-main">
        {lockReason(tool, identity) ? (
          <div className="empty"><p><strong>{t("lock.signIn")}</strong></p><p className="muted small">{t("lock.signInWhy")}</p></div>
        ) : (
          <ToolHost key={identity?.userId ?? "anon"} tool={tool} ctx={ctx} />
        )}
      </main>
    </div>
  );
}
