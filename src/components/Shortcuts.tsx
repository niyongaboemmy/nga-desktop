import { useEffect } from "react";
import { Keyboard, X } from "lucide-react";
import { isMac, mod } from "../lib/platform";

const shift = isMac ? "⇧" : "Shift+";
const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: "Apps",
    items: [
      [`${mod}1 … ${mod}4`, "Open NGA MIS, Task Mentor, Tendo, Tupo"],
      ["Ctrl+Tab", "Next app"],
      [`Ctrl+${shift}Tab`, "Previous app"],
      [`${mod}K`, "Search apps, pages and actions"],
    ],
  },
  {
    title: "Page",
    items: [
      [`${mod}[  ${mod}]`, "Back / forward"],
      [`${mod}R`, "Reload"],
      [`${mod}P`, "Print"],
      [`${mod}${shift}C`, "Copy the page link"],
      [`${mod}${shift}O`, "Open in your browser"],
      [`${mod}=  ${mod}-  ${mod}0`, "Zoom in / out / actual size"],
    ],
  },
  {
    title: "Window",
    items: [
      [`${mod}${shift}N`, "Notifications"],
      [`${mod}${shift}F`, "Focus mode"],
      [`${mod}${shift}L`, "Switch light / dark"],
      [`${mod}/`, "This list"],
    ],
  },
];

/** ⌘/ — every shortcut, in the floating overlay. */
export function Shortcuts({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet" role="dialog" aria-label="Keyboard shortcuts">
      <div className="sheet-head">
        <Keyboard size={18} />
        <strong>Keyboard shortcuts</strong>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>
      <div className="sheet-grid">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h4>{g.title}</h4>
            {g.items.map(([keys, what]) => (
              <div className="kbd-row" key={what}>
                <span>{what}</span>
                <kbd>{keys}</kbd>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
