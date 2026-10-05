import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Clock, CornerDownLeft, LayoutGrid, Search, Wrench, Zap } from "lucide-react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { DesktopApp } from "../lib/native";
import type { RecentPage } from "../lib/settings";
import { buildItems, search, type PaletteItem, type PaletteTool } from "../lib/palette";

/**
 * ⌘K: jump to any app, page or action. Rendered in the floating overlay window
 * (OverlayApp), so it sits over the app like Spotlight.
 */
export function Palette({
  apps, recent, tools, onPick, onClose,
}: { apps: DesktopApp[]; recent: RecentPage[]; tools: PaletteTool[]; onPick: (item: PaletteItem) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const items = useMemo(() => buildItems(apps, recent, tools), [apps, recent, tools]);
  const results = useMemo(() => search(items, query), [items, query]);

  useEffect(() => {
    // Keyboard focus is usually inside an app page: take it to the shell first.
    void getCurrentWebview().setFocus().catch(() => undefined).finally(() => input.current?.focus());
  }, []);
  useEffect(() => setSel(0), [query]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && results[sel]) onPick(results[sel]);
  };

  const icon = (it: PaletteItem) =>
    it.kind === "app" ? <img src={`/apps/${it.key}.png`} alt="" />
    : it.kind === "recent" ? <Clock size={16} />
    : it.kind === "go" ? <ArrowRight size={16} />
    : it.kind === "tool" ? <Wrench size={16} />
    : <Zap size={16} />;

  return (
    <div className="palette" role="dialog" aria-label="Search NGA">
      <div className="palette-input">
        <Search size={17} />
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder="Search apps, pages, tools and actions…"
          spellCheck={false}
        />
        <kbd>Esc</kbd>
      </div>
      <ul className="palette-list" role="listbox">
        {results.length === 0 && <li className="palette-empty"><LayoutGrid size={16} /> Nothing matches "{query}"</li>}
        {results.map((it, i) => (
          <li key={it.id} role="option" aria-selected={i === sel}>
            <button className={`palette-item${i === sel ? " sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => onPick(it)}>
              <span className="palette-icon">{icon(it)}</span>
              <span className="palette-label">{it.label}</span>
              <span className="palette-hint">{it.hint}</span>
              {i === sel && <CornerDownLeft size={14} className="muted" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
