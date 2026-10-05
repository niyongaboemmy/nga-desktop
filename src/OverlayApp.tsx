import { useEffect, useState } from "react";
import { Palette } from "./components/Palette";
import { Shortcuts } from "./components/Shortcuts";
import { native, on, type ShellInfo } from "./lib/native";
import { readSettings, type RecentPage } from "./lib/settings";
import { restoreTheme } from "./lib/theme";
import type { PaletteItem, PaletteTool } from "./lib/palette";
import { TOOLS } from "./tools/registry";
import { useLang } from "./tools/i18n";
import { useIdentity } from "./tools/shared/identity";
import { ToolsModal } from "./tools/ToolsModal";

/**
 * The floating overlay window (overlay.rs): a dimmed layer over the whole NGA
 * window with the ⌘K palette or the NGA Tools modal on top, so they float over
 * the apps instead of pushing them aside. Esc or a click on the backdrop closes it.
 * The palette also closes when NGA loses focus; a tool modal doesn't.
 */
export function OverlayApp() {
  const [info, setInfo] = useState<ShellInfo | null>(null);
  const [view, setView] = useState<string>("closed");
  const [recent, setRecent] = useState<RecentPage[]>([]);
  const [session, setSession] = useState(0);
  const [toolId, setToolId] = useState<string | null>(null);
  const [toolsMounted, setToolsMounted] = useState(false);
  const identity = useIdentity();
  const { lang, t } = useLang();

  useEffect(() => {
    void native.shellInfo().then(setInfo);
    const sub = on("nga://overlay", (v) => {
      setView(v);
      if (v !== "closed") {
        restoreTheme(); // follow the main window's current theme
        if (v === "palette" || v === "shortcuts") {
          setSession((n) => n + 1); // fresh, empty palette each time
          void readSettings().then((s) => setRecent(s.recent));
        }
      }
      if (v === "tools") setToolId(null);
      if (v.startsWith("tool:")) setToolId(v.slice(5));
      if (v === "tools" || v.startsWith("tool:")) setToolsMounted(true);
    });
    // The main window saves the theme in the same storage.
    const onStorage = () => restoreTheme();
    window.addEventListener("storage", onStorage);
    return () => {
      void sub.then((off) => off());
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const close = () => void native.overlayHide();
  const tools: PaletteTool[] = TOOLS.map((tm) => ({
    id: tm.id,
    label: t(tm.title),
    hint: `${t("palette.tool")} · ${t(tm.description)}`,
    words: tm.keywords.join(" "),
  }));
  const pick = (it: PaletteItem) => {
    if (it.kind === "app") void native.openApp(it.key).then(close);
    else if (it.kind === "go" || it.kind === "recent") void native.navigate(it.key, it.path).then(close);
    else if (it.kind === "tool") void native.overlayShow(`tool:${it.tool}`);
    else void native.overlayAction(it.action);
  };

  const toolsOpen = view === "tools" || view.startsWith("tool:");
  const open = view !== "closed";
  return (
    <div className={`overlay-root${open ? " open" : ""}${toolsOpen ? " modal-open" : ""}`} onMouseDown={(e) => open && e.target === e.currentTarget && close()}>
      {info && view === "palette" && <Palette key={session} apps={info.apps} recent={recent} tools={tools} onPick={pick} onClose={close} />}
      {view === "shortcuts" && <Shortcuts key={session} onClose={close} />}
      {toolsMounted && (
        <div className="modal-layer" hidden={!toolsOpen} onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <ToolsModal
            identity={identity}
            lang={lang}
            t={t}
            toolId={toolId}
            open={toolsOpen}
            onTool={(id) => void native.overlayShow(id ? `tool:${id}` : "tools")}
            onClose={close}
          />
        </div>
      )}
    </div>
  );
}
