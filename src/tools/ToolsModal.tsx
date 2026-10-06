import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ArrowLeft, CornerDownLeft, Lock, Maximize2, PictureInPicture2, Search, Star, X } from "lucide-react";
import { GROUPS, findTool, lockReason, visibleTools } from "./registry";
import { ToolHost, preloadTool } from "./ToolHost";
import { toolsNative } from "./shared/native";
import { readSettings, saveSetting } from "../lib/settings";
import { score } from "../lib/palette";
import type { Identity, ToolManifest } from "./types";
import type { Lang, Translate } from "./i18n";

const WIDTH = { s: 460, m: 600, l: 900 } as const;

interface Props {
  identity: Identity | null;
  lang: Lang;
  t: Translate;
  /** null: the tool launcher; else the open tool's id. */
  toolId: string | null;
  open: boolean;
  onTool: (id: string | null) => void;
  onClose: () => void;
}

/**
 * NGA Tools as a floating modal, centred over the whole window (it lives in the
 * overlay window, which draws above the apps). The launcher lists the tools; a
 * tool opens in place. Tools you opened stay mounted while the modal is closed,
 * so a calculation, a note or an AI answer is still there when you come back.
 */
export function ToolsModal({ identity, lang, t, toolId, open, onTool, onClose }: Props) {
  const tool = findTool(toolId);
  const [opened, setOpened] = useState<string[]>([]);
  const ctx = useMemo(() => ({ surface: "page" as const, present: false, identity, lang, t }), [identity, lang, t]);

  useEffect(() => {
    if (tool && !opened.includes(tool.id)) setOpened((o) => [...o, tool.id]);
  }, [tool, opened]);

  // A different person signed in: nothing of the previous person stays mounted.
  const who = identity?.userId ?? 0;
  useEffect(() => setOpened([]), [who]);

  // Esc closes (a tool may use Esc first, e.g. the calculator clears: it calls preventDefault).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pop = (tm: ToolManifest, present: boolean) => {
    void toolsNative.openWindow(tm.id, t(tm.title), present, present ? undefined : true).catch(() => undefined);
    onClose();
  };

  const size = tool ? tool.size : "l";
  return (
    <div
      className={`tools-modal size-${size}${tool ? " has-tool" : ""}`}
      style={{ "--modal-w": `${WIDTH[size]}px`, "--tool": tool?.color } as CSSProperties}
      role="dialog"
      aria-modal="true"
      aria-label={tool ? t(tool.title) : t("panel.title")}
    >
      {tool ? (
        <header className="modal-head">
          <button className="icon-btn" onClick={() => onTool(null)} title={t("panel.back")} aria-label={t("panel.back")}><ArrowLeft size={17} /></button>
          <span className="tile sm" style={{ "--tile": tool.color } as CSSProperties}><tool.icon size={16} /></span>
          <div className="modal-title">
            <strong>{t(tool.title)}</strong>
            <span>{t(tool.description)}</span>
          </div>
          <div className="modal-actions">
            {tool.popOut && <button onClick={() => pop(tool, false)} title={t("panel.popOut")} aria-label={t("panel.popOut")}><PictureInPicture2 size={16} /></button>}
            {tool.present && <button onClick={() => pop(tool, true)} title={t("panel.present")} aria-label={t("panel.present")}><Maximize2 size={15} /></button>}
            <button onClick={onClose} title={`${t("panel.close")} (Esc)`} aria-label={t("panel.close")}><X size={17} /></button>
          </div>
        </header>
      ) : null}
      <div className="modal-body">
        {!tool && <Launcher identity={identity} t={t} open={open} onTool={onTool} onClose={onClose} />}
        {opened.map((id) => {
          const tm = findTool(id);
          if (!tm) return null;
          const shown = tool?.id === id;
          return (
            <div key={`${id}-${who}`} className="modal-tool" hidden={!shown}>
              {lockReason(tm, identity) ? <Locked t={t} /> : <ToolHost tool={tm} ctx={ctx} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Locked({ t }: { t: Translate }) {
  return (
    <div className="empty">
      <Lock size={22} className="muted" />
      <p><strong>{t("lock.signIn")}</strong></p>
      <p className="muted small" style={{ maxWidth: 320, textAlign: "center" }}>{t("lock.signInWhy")}</p>
    </div>
  );
}

function Launcher({ identity, t, open, onTool, onClose }: {
  identity: Identity | null; t: Translate; open: boolean; onTool: (id: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [favs, setFavs] = useState<string[]>([]);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const flatRef = useRef<ToolManifest[]>([]);
  const tools = visibleTools(identity);

  useEffect(() => {
    void readSettings().then((s) => setFavs(s.toolsFavourites));
  }, []);
  useEffect(() => {
    if (!open) return;
    setQuery("");
    // Keyboard focus is usually inside an app page: take it to this window first.
    void getCurrentWebview().setFocus().catch(() => undefined).finally(() => input.current?.focus());
  }, [open]);
  useEffect(() => setSel(0), [query]);
  // The highlighted tool (keyboard or search) starts loading before Enter.
  useEffect(() => {
    const tm = flatRef.current[sel];
    if (tm) void preloadTool(tm);
  }, [sel, query]);

  const q = query.trim();
  const sections: Array<{ key: string; title: string; list: ToolManifest[] }> = q
    ? [{
        key: "found",
        title: "",
        list: tools
          .map((tm) => ({ tm, s: Math.max(score(q, t(tm.title)), score(q, `${t(tm.description)} ${tm.keywords.join(" ")}`) / 2) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .map((x) => x.tm),
      }]
    : [
        ...(favs.length ? [{ key: "fav", title: t("panel.favourites"), list: tools.filter((tm) => favs.includes(tm.id)) }] : []),
        ...GROUPS.map((g) => ({ key: g, title: t(`group.${g}` as never), list: tools.filter((tm) => tm.group === g) })).filter((s) => s.list.length),
      ];
  const flat = sections.flatMap((s) => s.list);
  flatRef.current = flat;

  const toggleFav = (id: string) =>
    setFavs((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      void saveSetting("toolsFavourites", next);
      return next;
    });

  const onKey = (e: React.KeyboardEvent) => {
    const cols = window.innerWidth > 760 ? 3 : 2;
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + cols)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - cols)); }
    else if (e.key === "ArrowRight" && !query) { e.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + 1)); }
    else if (e.key === "ArrowLeft" && !query) { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter" && flat[sel]) onTool(flat[sel].id);
  };

  let index = -1;
  return (
    <div className="launcher">
      <div className="launcher-search">
        <Search size={18} />
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder={t("panel.search")}
          spellCheck={false}
          aria-label={t("panel.search")}
        />
        <button className="icon-btn" onClick={onClose} title={`${t("panel.close")} (Esc)`} aria-label={t("panel.close")}><X size={17} /></button>
      </div>
      <div className="launcher-list">
        {flat.length === 0 && <p className="muted launcher-none">{t("panel.noMatch", { q })}</p>}
        {sections.map((s) => (
          <section key={s.key}>
            {s.title && <h4>{s.title}</h4>}
            <ul className="launcher-grid">
              {s.list.map((tm) => {
                index++;
                const i = index;
                const locked = lockReason(tm, identity);
                const fav = favs.includes(tm.id);
                return (
                  <li key={`${s.key}-${tm.id}`}>
                    <div className={`tool-tile${i === sel ? " sel" : ""}${locked ? " locked" : ""}`} onMouseEnter={() => { setSel(i); void preloadTool(tm); }}>
                      <button className="tool-tile-main" onFocus={() => void preloadTool(tm)} onClick={() => onTool(tm.id)} title={locked ? t(locked) : t(tm.description)}>
                        <span className="tile" style={{ "--tile": tm.color } as CSSProperties}><tm.icon size={19} /></span>
                        <span className="tool-text">
                          <span className="tool-name">{t(tm.title)}{locked && <Lock size={11} className="muted" />}</span>
                          <span className="tool-desc">{t(tm.description)}</span>
                        </span>
                      </button>
                      <button className={`fav${fav ? " on" : ""}`} onClick={() => toggleFav(tm.id)} aria-pressed={fav} title={fav ? t("panel.unfavourite") : t("panel.favourite")} aria-label={fav ? t("panel.unfavourite") : t("panel.favourite")}>
                        <Star size={13} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <footer className="launcher-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> {t("modal.move")}</span>
        <span><kbd><CornerDownLeft size={11} /></kbd> {t("modal.open")}</span>
        <span><kbd>Esc</kbd> {t("panel.close")}</span>
        <span className="flex" />
        <span className="muted">{identity ? t("modal.private") : t("modal.signedOut")}</span>
      </footer>
    </div>
  );
}
