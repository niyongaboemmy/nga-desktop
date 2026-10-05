import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Lock, Maximize2, PictureInPicture2, Search, Star, X } from "lucide-react";
import { GROUPS, findTool, lockReason, visibleTools } from "./registry";
import { ToolHost } from "./ToolHost";
import { toolsNative } from "./shared/native";
import { readSettings, saveSetting } from "../lib/settings";
import type { Identity, ToolManifest } from "./types";
import type { Lang, Translate } from "./i18n";
import { score } from "../lib/palette";

const MIN_W = 300, MAX_W = 620;

interface Props {
  identity: Identity | null;
  lang: Lang;
  t: Translate;
  /** The tool open in the panel (null: the tool list). */
  toolId: string | null;
  onTool: (id: string | null) => void;
  onClose: () => void;
}

/** The Tools side panel: the app stays usable beside it (it shrinks, like the notifications panel). */
export function ToolsPanel({ identity, lang, t, toolId, onTool, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [favs, setFavs] = useState<string[]>([]);
  const [width, setWidth] = useState(380);
  const panel = useRef<HTMLElement>(null);
  const tool = findTool(toolId);
  // Back on the list after using a tool: start from the full list again.
  useEffect(() => {
    if (toolId) setQuery("");
  }, [toolId]);

  useEffect(() => {
    void readSettings().then((s) => {
      setFavs(s.toolsFavourites);
      setWidth(Math.min(MAX_W, Math.max(MIN_W, s.toolsPanelWidth)));
    });
  }, []);

  const toggleFav = (id: string) =>
    setFavs((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      void saveSetting("toolsFavourites", next);
      return next;
    });

  // Drag the left edge to resize (the app beside it follows through the insets).
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = width;
    let w = startW;
    const move = (ev: PointerEvent) => {
      w = Math.min(MAX_W, Math.max(MIN_W, startW + (startX - ev.clientX)));
      setWidth(w);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      void saveSetting("toolsPanelWidth", Math.round(w));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const ctx = useMemo(() => ({ surface: "panel" as const, present: false, identity, lang, t }), [identity, lang, t]);
  const open = (tm: ToolManifest, how: "window" | "present") =>
    void toolsNative.openWindow(tm.id, t(tm.title), how === "present", how === "window" ? true : undefined).catch(() => undefined);

  return (
    <aside className="panel tools-panel" ref={panel} style={{ width }} aria-label={t("panel.title")}>
      <div className="resize-edge" onPointerDown={startResize} role="separator" aria-orientation="vertical" aria-label={t("panel.resize")} />
      {tool ? (
        <>
          <div className="panel-head tool-head">
            <button className="icon-btn" onClick={() => onTool(null)} title={t("panel.back")} aria-label={t("panel.back")}><ArrowLeft size={16} /></button>
            <tool.icon size={16} className="tool-head-icon" />
            <strong className="tool-head-title">{t(tool.title)}</strong>
            <div className="panel-actions">
              {tool.popOut && (
                <button onClick={() => open(tool, "window")} title={t("panel.popOut")} aria-label={t("panel.popOut")}><PictureInPicture2 size={15} /></button>
              )}
              {tool.present && (
                <button onClick={() => open(tool, "present")} title={t("panel.present")} aria-label={t("panel.present")}><Maximize2 size={15} /></button>
              )}
              <button onClick={onClose} title={t("panel.close")} aria-label={t("panel.close")}><X size={16} /></button>
            </div>
          </div>
          {lockReason(tool, identity) ? (
            <Locked t={t} />
          ) : (
            <ToolHost key={`${tool.id}-${identity?.userId ?? "anon"}`} tool={tool} ctx={ctx} />
          )}
        </>
      ) : (
        <>
          <div className="panel-head">
            <strong>{t("panel.title")}</strong>
            <div className="panel-actions">
              <button onClick={onClose} title={t("panel.close")} aria-label={t("panel.close")}><X size={16} /></button>
            </div>
          </div>
          <ToolList identity={identity} t={t} query={query} setQuery={setQuery} favs={favs} toggleFav={toggleFav} onTool={onTool} />
        </>
      )}
    </aside>
  );
}

function Locked({ t }: { t: Translate }) {
  return (
    <div className="empty">
      <Lock size={22} className="muted" />
      <p><strong>{t("lock.signIn")}</strong></p>
      <p className="muted small" style={{ maxWidth: 260, textAlign: "center" }}>{t("lock.signInWhy")}</p>
    </div>
  );
}

function ToolList({ identity, t, query, setQuery, favs, toggleFav, onTool }: {
  identity: Identity | null; t: Translate; query: string; setQuery: (q: string) => void;
  favs: string[]; toggleFav: (id: string) => void; onTool: (id: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const tools = visibleTools(identity);
  const q = query.trim();
  const found = q
    ? tools
        .map((tm) => ({ tm, s: Math.max(score(q, t(tm.title)), score(q, `${t(tm.description)} ${tm.keywords.join(" ")}`) / 2) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.tm)
    : null;
  const card = (tm: ToolManifest) => {
    const locked = lockReason(tm, identity);
    const fav = favs.includes(tm.id);
    return (
      <li key={tm.id}>
        <div className={`tool-card${locked ? " locked" : ""}`}>
          <button className="tool-card-main" onClick={() => onTool(tm.id)} title={locked ? t(locked) : t(tm.description)}>
            <span className="tool-icon"><tm.icon size={18} /></span>
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
  };
  return (
    <div className="tool-list">
      <label className="tool-search">
        <Search size={14} />
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && found?.[0]) onTool(found[0].id); }}
          placeholder={t("panel.search")}
          spellCheck={false}
        />
      </label>
      {found ? (
        found.length ? <ul className="tool-grid">{found.map(card)}</ul> : <p className="muted small tool-none">{t("panel.noMatch", { q })}</p>
      ) : (
        <>
          {favs.length > 0 && (
            <section>
              <h4>{t("panel.favourites")}</h4>
              <ul className="tool-grid">{tools.filter((tm) => favs.includes(tm.id)).map(card)}</ul>
            </section>
          )}
          {GROUPS.map((g) => {
            const list = tools.filter((tm) => tm.group === g);
            return list.length ? (
              <section key={g}>
                <h4>{t(`group.${g}` as never)}</h4>
                <ul className="tool-grid">{list.map(card)}</ul>
              </section>
            ) : null;
          })}
          <p className="muted small tool-footnote">{identity ? t("panel.dataNote") : t("panel.signedOutNote")}</p>
        </>
      )}
    </div>
  );
}
