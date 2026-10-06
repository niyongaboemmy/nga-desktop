import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, History, LoaderCircle, RotateCcw, Search, Send, Sparkles, Undo2 } from "lucide-react";
import { misCall, MisApiError } from "../shared/api";
import { dictionaries } from "../i18n";
import { en } from "../i18n/en";
import { writeOverrides, type Override } from "../i18n/overrides";
import { GLOSSARY, buildRows, counts, filterRows, placeholders, problem, type Row, type TrEntry, type TrLang, type TrStatus } from "./translationModel";
import type { ToolProps } from "../types";
import type { Key, Translate } from "../i18n";
import "./office.css";

interface Release { id: number; count: number; note: string | null; publishedAt: string; publishedBy: string }
const STATUSES: Array<TrStatus | "all" | "unpublished"> = ["all", "untouched", "ai_draft", "draft", "approved", "outdated", "unpublished"];

/**
 * Translation workspace (plan §6.3.1): review the tools' French and Kinyarwanda
 * texts, correct them, approve, publish. Desktops pick up a release within minutes,
 * with no app update. Only people with TOOLS_TRANSLATIONS_MANAGE see this tool.
 */
export default function Translations({ ctx }: ToolProps) {
  const { t } = ctx;
  const [lang, setLang] = useState<TrLang>(ctx.lang === "rw" ? "rw" : "fr");
  const [entries, setEntries] = useState<Record<string, TrEntry> | null>(null);
  const [published, setPublished] = useState<{ release: number; strings: Record<string, Override> }>({ release: 0, strings: {} });
  const [releases, setReleases] = useState<Release[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<TrStatus | "all" | "unpublished">("all");
  const [group, setGroup] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [showReleases, setShowReleases] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [ws, pub] = await Promise.all([
        misCall<{ entries: Record<string, TrEntry>; releases: Release[] }>({ method: "GET", path: `/desktop/tools/i18n/workspace/${lang}`, timeoutMs: 20_000 }),
        misCall<{ release: number; strings?: Record<string, Override> }>({ method: "GET", path: `/desktop/tools/i18n/${lang}`, timeoutMs: 20_000 }),
      ]);
      setEntries(ws?.entries ?? {});
      setReleases(ws?.releases ?? []);
      setPublished({ release: pub?.release ?? 0, strings: pub?.strings ?? {} });
    } catch (e) {
      setError(e instanceof MisApiError && e.status === 403 ? t("tr.noPermission") : (e as Error).message);
    }
  }, [lang, t]);
  useEffect(() => {
    setEntries(null);
    void load();
  }, [load]);

  const rows = useMemo(() => (entries ? buildRows(en, dictionaries[lang], entries, published.strings) : []), [entries, lang, published]);
  const c = useMemo(() => counts(rows), [rows]);
  const groups = useMemo(() => [...new Set(rows.map((r) => r.group))].sort(), [rows]);
  const list = useMemo(() => filterRows(rows, q, status, group), [rows, q, status, group]);
  const row = rows.find((r) => r.key === sel) ?? null;

  const save = async (r: Row, text: string, st: "draft" | "ai_draft" | "approved") => {
    setBusy(true);
    setNote(null);
    try {
      const e = await misCall<TrEntry & { key: string }>({ method: "POST", path: "/desktop/tools/i18n/edit", body: { lang, key: r.key, en: r.en, text, status: st, previous: r.current }, timeoutMs: 20_000 });
      if (e) setEntries((x) => ({ ...(x ?? {}), [r.key]: e }));
      if (st === "approved") {
        // Next string that still needs a look, in the current list.
        const i = list.findIndex((x) => x.key === r.key);
        const next = list.slice(i + 1).find((x) => x.status !== "approved");
        if (next) setSel(next.key);
      }
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const revert = async (r: Row) => {
    setBusy(true);
    try {
      await misCall({ method: "POST", path: "/desktop/tools/i18n/revert", body: { lang, key: r.key }, timeoutMs: 20_000 });
      setEntries((x) => {
        const n = { ...(x ?? {}) };
        delete n[r.key];
        return n;
      });
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await misCall<{ id: number; count: number }>({ method: "POST", path: "/desktop/tools/i18n/publish", body: { lang }, timeoutMs: 20_000 });
      await load();
      // This computer at once; others within 5 minutes.
      const pub = await misCall<{ release: number; strings?: Record<string, Override> }>({ method: "GET", path: `/desktop/tools/i18n/${lang}`, timeoutMs: 20_000 });
      if (pub?.strings) writeOverrides(lang, { release: pub.release, strings: pub.strings });
      setNote(t("tr.published", { n: r?.id ?? 0, count: r?.count ?? 0 }));
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const rollback = async (id: number) => {
    setBusy(true);
    try {
      await misCall({ method: "POST", path: "/desktop/tools/i18n/rollback", body: { lang, release: id }, timeoutMs: 20_000 });
      await load();
      const pub = await misCall<{ release: number; strings?: Record<string, Override> }>({ method: "GET", path: `/desktop/tools/i18n/${lang}`, timeoutMs: 20_000 });
      if (pub?.strings) writeOverrides(lang, { release: pub.release, strings: pub.strings });
      setNote(t("tr.rolledBack", { n: id }));
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="empty"><p><strong>{error}</strong></p><button className="btn sm" onClick={() => void load()}><RotateCcw size={13} /> {t("tr.retry")}</button></div>;
  if (!entries) return <div className="tool-loading"><LoaderCircle size={20} className="spin" /></div>;

  return (
    <div className="trw">
      <div className="trw-top">
        <div className="segmented-sm" role="group" aria-label={t("tr.language")}>
          {(["fr", "rw"] as const).map((l) => <button key={l} className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => { setLang(l); setSel(null); }}>{l === "fr" ? "Français" : "Ikinyarwanda"}</button>)}
        </div>
        <span className="muted small">{t("tr.summary", { approved: c.approved, total: rows.length, outdated: c.outdated })}</span>
        <span className="flex" />
        <button className="btn sm" onClick={() => setShowReleases((v) => !v)} aria-expanded={showReleases}><History size={13} /> {t("tr.releases")} {published.release ? `#${published.release}` : ""}</button>
        <button className="btn sm primary" disabled={busy || c.unpublished === 0} onClick={() => void publish()}><Send size={13} /> {t("tr.publish", { n: c.unpublished })}</button>
      </div>
      {showReleases && (
        <ul className="trw-releases">
          {releases.length === 0 && <li className="muted small">{t("tr.noReleases")}</li>}
          {releases.map((r, i) => (
            <li key={r.id}>
              <strong>#{r.id}</strong>
              <span className="muted small">{t("tr.releaseLine", { count: r.count, by: r.publishedBy || "—", date: new Date(r.publishedAt).toLocaleString() })}{r.note ? ` · ${r.note}` : ""}</span>
              <span className="flex" />
              {i > 0 && <button className="btn sm" disabled={busy} onClick={() => void rollback(r.id)}><Undo2 size={12} /> {t("tr.rollback")}</button>}
              {i === 0 && <span className="chip">{t("tr.live")}</span>}
            </li>
          ))}
        </ul>
      )}
      {note && <p className="muted small" role="status">{note}</p>}
      <div className="trw-body">
        <div className="trw-list">
          <div className="trw-filters">
            <label className="tool-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("tr.search")} aria-label={t("tr.search")} /></label>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label={t("tr.status")}>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`tr.st.${s}` as Key)}{s !== "all" ? ` (${c[s as keyof typeof c]})` : ""}</option>)}
            </select>
            <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label={t("tr.group")}>
              <option value="">{t("tr.allGroups")}</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <ul role="listbox" aria-label={t("tr.strings")}>
            {list.slice(0, 400).map((r) => (
              <li key={r.key} role="none">
                <button role="option" aria-selected={sel === r.key} className={sel === r.key ? "sel" : ""} onClick={() => setSel(r.key)}>
                  <span className="trw-en">{r.en}</span>
                  <span className="trw-cur">{r.entry?.text ?? r.current}</span>
                  <span className={`trw-badge ${r.status}`}>{t(`tr.st.${r.status}` as Key)}{r.unpublished ? " •" : ""}</span>
                </button>
              </li>
            ))}
            {list.length > 400 && <li role="none" className="muted small trw-more">{t("tr.more", { n: list.length - 400 })}</li>}
            {list.length === 0 && <li role="none" className="muted small trw-more">{t("tr.none")}</li>}
          </ul>
        </div>
        {row ? <Editor key={`${lang}:${row.key}`} row={row} lang={lang} t={t} busy={busy} onSave={save} onRevert={revert} /> : <div className="trw-editor empty"><p className="muted">{t("tr.pick")}</p></div>}
      </div>
    </div>
  );
}

function Editor({ row, lang, t, busy, onSave, onRevert }: {
  row: Row; lang: TrLang; t: Translate; busy: boolean;
  onSave: (r: Row, text: string, st: "draft" | "ai_draft" | "approved") => Promise<void>;
  onRevert: (r: Row) => Promise<void>;
}) {
  const [text, setText] = useState(row.entry?.text ?? row.current);
  const [ai, setAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const issue = problem(row.en, text);

  const suggest = async () => {
    setAi(true);
    setAiError(null);
    try {
      const r = await misCall<{ text: string }>({ method: "POST", path: "/desktop/tools/i18n/suggest", body: { lang, key: row.key, en: row.en, glossary: GLOSSARY }, timeoutMs: 90_000 });
      if (r?.text) {
        setText(r.text);
        await onSave(row, r.text, "ai_draft");
      }
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAi(false);
    }
  };

  return (
    <div className="trw-editor" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !issue && !busy) { e.preventDefault(); void onSave(row, text, "approved"); } }}>
      <span className="muted small trw-key">{row.key}</span>
      <div className="trw-source">
        <span className="trw-label">English</span>
        <p>{row.en}</p>
        {placeholders(row.en) && <span className="muted small">{t("tr.keep", { list: placeholders(row.en) })}</span>}
      </div>
      <label className="trw-label" htmlFor="trw-text">{lang === "fr" ? "Français" : "Ikinyarwanda"}</label>
      <textarea id="trw-text" value={text} onChange={(e) => setText(e.target.value)} rows={4} />
      {issue && <p className="field-error">{t(`tr.problem.${issue}` as Key, { list: placeholders(row.en) || "—" })}</p>}
      {row.status === "outdated" && <p className="muted small">{t("tr.outdatedHint")}</p>}
      {row.entry && <p className="muted small">{t("tr.lastEdit", { by: row.entry.updatedBy || "—", date: new Date(row.entry.updatedAt).toLocaleString(), status: t(`tr.st.${row.entry.status}` as Key) })}</p>}
      {aiError && <p className="field-error">{aiError}</p>}
      <div className="row">
        <button className="btn sm" disabled={ai || busy} onClick={() => void suggest()}>{ai ? <LoaderCircle size={13} className="spin" /> : <Sparkles size={13} />} {t("tr.suggest")}</button>
        <span className="flex" />
        {row.entry && <button className="btn sm" disabled={busy} onClick={() => void onRevert(row)}><Undo2 size={13} /> {t("tr.revert")}</button>}
        <button className="btn sm" disabled={busy || !!issue} onClick={() => void onSave(row, text, "draft")}>{t("tr.saveDraft")}</button>
        <button className="btn sm primary" disabled={busy || !!issue} onClick={() => void onSave(row, text, "approved")} title="⌘/Ctrl + Enter"><Check size={13} /> {t("tr.approve")}</button>
      </div>
      <p className="muted small">{t("tr.aiNote")}</p>
    </div>
  );
}
