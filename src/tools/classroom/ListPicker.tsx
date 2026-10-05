import { useState } from "react";
import { ListPlus, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { parseNames, type ClassList, type useClassLists } from "./roster";
import type { Translate } from "../i18n";

/** Choose a class (from MIS) or one of your own lists; make and edit your own. */
export function ListPicker({ t, value, onChange, roster }: {
  t: Translate; value: string | null; onChange: (id: string) => void; roster: ReturnType<typeof useClassLists>;
}) {
  const [editing, setEditing] = useState<{ id: string | null; name: string; text: string } | null>(null);
  const current = roster.lists.find((l) => l.id === value) ?? null;
  if (editing)
    return (
      <div className="list-editor">
        <label className="field"><span>{t("class.listName")}</span><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={t("class.listNameHint")} /></label>
        <label className="field"><span>{t("class.names")}</span><textarea rows={6} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} placeholder={t("class.namesHint")} /></label>
        <div className="row">
          <button className="btn sm primary" disabled={parseNames(editing.text).length === 0} onClick={() => {
            roster.saveOwn(editing.id, editing.name, parseNames(editing.text));
            setEditing(null);
          }}>{t("class.save", { n: parseNames(editing.text).length })}</button>
          <button className="btn sm" onClick={() => setEditing(null)}>{t("common.cancel")}</button>
        </div>
      </div>
    );
  return (
    <div className="list-picker">
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} aria-label={t("class.choose")}>
        <option value="" disabled>{roster.lists.length ? t("class.choose") : roster.loading ? t("class.loading") : t("class.none")}</option>
        {roster.lists.some((l) => l.source === "mis") && (
          <optgroup label={t("class.fromMis")}>
            {roster.lists.filter((l) => l.source === "mis").map((l) => <option key={l.id} value={l.id}>{l.name} · {l.people.length}</option>)}
          </optgroup>
        )}
        {roster.lists.some((l) => l.source === "own") && (
          <optgroup label={t("class.mine")}>
            {roster.lists.filter((l) => l.source === "own").map((l) => <option key={l.id} value={l.id}>{l.name} · {l.people.length}</option>)}
          </optgroup>
        )}
      </select>
      <button className="icon-btn" onClick={() => setEditing({ id: null, name: "", text: "" })} title={t("class.newList")} aria-label={t("class.newList")}><ListPlus size={16} /></button>
      {current?.source === "own" && (
        <>
          <button className="icon-btn" onClick={() => setEditing({ id: current.id, name: current.name, text: current.people.map((p) => p.name).join("\n") })} title={t("class.editList")} aria-label={t("class.editList")}><Pencil size={14} /></button>
          <button className="icon-btn" onClick={() => roster.deleteOwn(current.id)} title={t("class.deleteList")} aria-label={t("class.deleteList")}><Trash2 size={14} /></button>
        </>
      )}
      <button className="icon-btn" onClick={roster.refresh} disabled={roster.loading} title={t("myday.refresh")} aria-label={t("myday.refresh")}><RefreshCw size={14} className={roster.loading ? "spin" : ""} /></button>
    </div>
  );
}

export const listById = (lists: ClassList[], id: string | null) => lists.find((l) => l.id === id) ?? null;
