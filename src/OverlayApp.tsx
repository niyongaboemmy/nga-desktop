import { useEffect, useState } from "react";
import { Palette } from "./components/Palette";
import { Shortcuts } from "./components/Shortcuts";
import { native, on, type ShellInfo } from "./lib/native";
import { readSettings, type RecentPage } from "./lib/settings";
import { restoreTheme } from "./lib/theme";
import type { PaletteItem, PaletteTool } from "./lib/palette";
import { TOOLS } from "./tools/registry";
import { readLangPref, resolveLang, translator } from "./tools/i18n";

/**
 * The floating overlay window (overlay.rs): a dimmed layer over the whole NGA
 * window with the ⌘K palette on top, so it floats over the app instead of
 * pushing it. Esc, a click outside the card, or leaving the window closes it.
 */
export function OverlayApp() {
  const [info, setInfo] = useState<ShellInfo | null>(null);
  const [view, setView] = useState<string>("closed");
  const [recent, setRecent] = useState<RecentPage[]>([]);
  const [session, setSession] = useState(0);

  useEffect(() => {
    void native.shellInfo().then(setInfo);
    const sub = on("nga://overlay", (v) => {
      setView(v);
      if (v !== "closed") {
        restoreTheme(); // follow the main window's current theme
        setSession((n) => n + 1); // fresh, empty palette each time
        void readSettings().then((s) => setRecent(s.recent));
      }
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
  const t = translator(resolveLang(readLangPref()));
  const tools: PaletteTool[] = TOOLS.map((tm) => ({
    id: tm.id,
    label: t(tm.title),
    hint: `${t("palette.tool")} · ${t(tm.description)}`,
    words: tm.keywords.join(" "),
  }));
  const pick = (it: PaletteItem) => {
    if (it.kind === "app") void native.openApp(it.key).then(close);
    else if (it.kind === "go" || it.kind === "recent") void native.navigate(it.key, it.path).then(close);
    else if (it.kind === "tool") void native.overlayAction(`tool:${it.tool}`);
    else void native.overlayAction(it.action);
  };

  if (!info || view === "closed") return <div className="overlay-root" />;
  return (
    <div className="overlay-root open" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      {view === "palette" && <Palette key={session} apps={info.apps} recent={recent} tools={tools} onPick={pick} onClose={close} />}
      {view === "shortcuts" && <Shortcuts key={session} onClose={close} />}
    </div>
  );
}
