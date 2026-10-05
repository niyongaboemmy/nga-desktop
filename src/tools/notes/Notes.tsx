import { useMemo, useState } from "react";
import { ArrowLeft, Download, Eye, Pencil, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import { newNote, render, searchNotes, tags, title, type Note } from "./noteModel";
import { usePersonal } from "../shared/store";
import { textToBase64, toolsNative } from "../shared/native";
import type { ToolProps } from "../types";

const MAX_NOTES = 1000;

export default function Notes({ ctx }: ToolProps) {
  const { t, identity, lang } = ctx;
  const [notes, setNotes, ready] = usePersonal<Note[]>(identity, "notes", []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => searchNotes(notes, query), [notes, query]);
  const open = notes.find((n) => n.id === openId) ?? null;
  const date = (at: number) => new Date(at).toLocaleDateString(lang === "rw" ? "rw-RW" : lang, { day: "numeric", month: "short", year: "numeric" });

  const create = () => {
    if (notes.length >= MAX_NOTES) return;
    const n = newNote();
    setNotes((list) => [n, ...list]);
    setOpenId(n.id);
  };
  const update = (id: string, patch: Partial<Note>) =>
    setNotes((list) => list.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)));

  if (!ready) return null;
  if (open) {
    return (
      <Editor
        note={open}
        t={t}
        onBack={() => {
          // An untouched new note isn't kept.
          if (!open.body.trim()) setNotes((list) => list.filter((n) => n.id !== open.id));
          setOpenId(null);
        }}
        onChange={(body) => update(open.id, { body })}
        onPin={() => update(open.id, { pinned: !open.pinned })}
        onDelete={() => { setNotes((list) => list.filter((n) => n.id !== open.id)); setOpenId(null); }}
      />
    );
  }
  return (
    <div className="notes">
      <div className="notes-bar">
        <label className="tool-search">
          <Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("notes.search")} spellCheck={false} />
        </label>
        <button className="btn sm primary" onClick={create} disabled={notes.length >= MAX_NOTES}><Plus size={14} /> {t("notes.new")}</button>
      </div>
      {notes.length === 0 ? (
        <div className="empty"><p className="muted">{t("notes.empty")}</p><p className="muted small">{t("notes.emptyHint")}</p></div>
      ) : shown.length === 0 ? (
        <p className="muted small">{t("panel.noMatch", { q: query })}</p>
      ) : (
        <ul className="note-list">
          {shown.map((n) => (
            <li key={n.id}>
              <button className="note-item" onClick={() => setOpenId(n.id)}>
                <span className="note-title">{n.pinned && <Pin size={11} />} {title(n) || t("notes.untitled")}</span>
                <span className="note-snippet muted">{n.body.split("\n").slice(1).join(" ").slice(0, 90)}</span>
                <span className="note-foot muted small">
                  {date(n.updatedAt)}
                  {tags(n.body).slice(0, 3).map((g) => <span key={g} className="tag">#{g}</span>)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">{t("notes.privacy")}</p>
    </div>
  );
}

function Editor({ note, t, onBack, onChange, onPin, onDelete }: {
  note: Note; t: ToolProps["ctx"]["t"]; onBack: () => void; onChange: (b: string) => void; onPin: () => void; onDelete: () => void;
}) {
  const [preview, setPreview] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const html = useMemo(() => (preview ? render(note.body) : ""), [preview, note.body]);
  const exportMd = async () => {
    try {
      const name = `${(title(note) || "note").slice(0, 40)}.md`;
      const path = await toolsNative.saveFile(name, textToBase64(note.body));
      setSaved(path.split(/[\\/]/).pop() ?? name);
    } catch (e) {
      setSaved(String(e));
    }
  };
  return (
    <div className="note-editor">
      <div className="notes-bar">
        <button className="icon-btn" onClick={onBack} title={t("notes.back")} aria-label={t("notes.back")}><ArrowLeft size={16} /></button>
        <span className="flex" />
        <button className={`icon-btn${preview ? " on" : ""}`} onClick={() => setPreview((p) => !p)} title={preview ? t("notes.edit") : t("notes.preview")} aria-label={preview ? t("notes.edit") : t("notes.preview")}>
          {preview ? <Pencil size={15} /> : <Eye size={15} />}
        </button>
        <button className="icon-btn" onClick={onPin} title={note.pinned ? t("notes.unpin") : t("notes.pin")} aria-label={note.pinned ? t("notes.unpin") : t("notes.pin")}>
          {note.pinned ? <PinOff size={15} /> : <Pin size={15} />}
        </button>
        <button className="icon-btn" onClick={() => void exportMd()} title={t("notes.export")} aria-label={t("notes.export")} disabled={!note.body.trim()}><Download size={15} /></button>
        <button className="icon-btn" onClick={() => setConfirm(true)} title={t("notes.delete")} aria-label={t("notes.delete")}><Trash2 size={15} /></button>
      </div>
      {confirm && (
        <div className="confirm" role="alertdialog">
          <span>{t("notes.confirmDelete")}</span>
          <button className="btn sm danger" onClick={onDelete}>{t("notes.delete")}</button>
          <button className="btn sm" onClick={() => setConfirm(false)}>{t("common.cancel")}</button>
        </div>
      )}
      {saved && <p className="muted small">{t("common.savedTo", { name: saved })}</p>}
      {preview ? (
        <article className="note-preview" dangerouslySetInnerHTML={{ __html: html || `<p class="muted">${t("notes.nothing")}</p>` }} />
      ) : (
        <textarea
          autoFocus
          className="note-text"
          value={note.body}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("notes.placeholder")}
          spellCheck
          maxLength={100_000}
        />
      )}
    </div>
  );
}
