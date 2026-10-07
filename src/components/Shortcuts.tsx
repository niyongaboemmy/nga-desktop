import { useEffect } from "react";
import { Keyboard, X } from "lucide-react";
import { isMac, mod } from "../lib/platform";
import { useLang, type Key } from "../tools/i18n";

const shift = isMac ? "⇧" : "Shift+";
const GROUPS: Array<{ title: Key; items: Array<[string, Key]> }> = [
  {
    title: "shell.keys.apps",
    items: [
      [`${mod}1 … ${mod}4`, "shell.keys.openApps"],
      ["Ctrl+Tab", "shell.keys.nextApp"],
      [`Ctrl+${shift}Tab`, "shell.keys.prevApp"],
      [`${mod}K`, "shell.keys.search"],
    ],
  },
  {
    title: "shell.keys.page",
    items: [
      [`${mod}[  ${mod}]`, "shell.keys.backForward"],
      [`${mod}R`, "shell.nav.reload"],
      [`${mod}P`, "shell.keys.print"],
      [`${mod}${shift}C`, "shell.keys.copyLink"],
      [`${mod}${shift}O`, "shell.keys.openBrowser"],
      [`${mod}=  ${mod}-  ${mod}0`, "shell.keys.zoom"],
    ],
  },
  {
    title: "shell.keys.window",
    items: [
      [`${mod}${shift}N`, "shell.notices.title"],
      [`${mod}${shift}T`, "shell.keys.tools"],
      [`${mod}${shift}F`, "shell.action.focus"],
      [`${mod}${shift}L`, "shell.action.theme"],
      [`${mod}/`, "shell.keys.list"],
    ],
  },
];

/** ⌘/ — every shortcut, in the floating overlay. */
export function Shortcuts({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet" role="dialog" aria-label={t("shell.shortcuts.title")}>
      <div className="sheet-head">
        <Keyboard size={18} />
        <strong>{t("shell.shortcuts.title")}</strong>
        <button className="icon-btn" onClick={onClose} aria-label={t("shell.common.close")}><X size={16} /></button>
      </div>
      <div className="sheet-grid">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h4>{t(g.title)}</h4>
            {g.items.map(([keys, what]) => (
              <div className="kbd-row" key={what}>
                <span>{t(what)}</span>
                <kbd>{keys}</kbd>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
