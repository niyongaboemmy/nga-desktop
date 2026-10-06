import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FilePlus2, FileStack, LoaderCircle, RotateCcw, RotateCw, Scissors, Trash2, X } from "lucide-react";
import { PdfError, baseName, buildPdf, move, openPdf, pageRefs, rotate, splitPdf, toBase64, type PageRef, type Source } from "./pdfBuild";
import { readImage, renderThumbs } from "./thumbs";
import { toolsNative } from "../shared/native";
import type { ToolProps } from "../types";
import "./office.css";

const THUMB = 120;
const MAX_FILE = 50 * 1024 * 1024;
const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * PDF tools (plan Phase 7.1): put pages of PDFs and pictures together, reorder,
 * rotate, remove, watermark, number, split — on this computer only, nothing is
 * uploaded. Saves to Downloads.
 */
export default function PdfTool({ ctx }: ToolProps) {
  const { t } = ctx;
  const [sources, setSources] = useState<Source[]>([]);
  const [pages, setPages] = useState<PageRef[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [watermark, setWatermark] = useState("");
  const [numbers, setNumbers] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const alive = useRef({ cancelled: false });
  // A fresh flag per mount (React may mount twice in development).
  useEffect(() => {
    const flag = { cancelled: false };
    alive.current = flag;
    return () => void (flag.cancelled = true);
  }, []);

  const say = (kind: "ok" | "error", text: string) => setMessage({ kind, text });

  const add = async (files: FileList | File[]) => {
    setMessage(null);
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE) {
        say("error", t("pdf.tooBig", { name: f.name }));
        continue;
      }
      const id = newId();
      try {
        if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
          const bytes = new Uint8Array(await f.arrayBuffer());
          const doc = await openPdf(bytes);
          const src: Source = { id, name: f.name, kind: "pdf", bytes, pageCount: doc.getPageCount() };
          setSources((s) => [...s, src]);
          setPages((p) => [...p, ...pageRefs(src)]);
          setName((n) => n || baseName(f.name));
          void renderThumbs(bytes, THUMB, (i, url) => setThumbs((th) => ({ ...th, [`${id}:${i}`]: url })), alive.current).catch((e) => console.error("pdf thumbnails", e));
        } else if (f.type.startsWith("image/")) {
          const img = await readImage(f, THUMB);
          const src: Source = { id, name: f.name, kind: "image", bytes: img.bytes, mime: img.mime, pageCount: 1 };
          setSources((s) => [...s, src]);
          setPages((p) => [...p, ...pageRefs(src)]);
          setThumbs((th) => ({ ...th, [`${id}:0`]: img.thumb }));
          setName((n) => n || baseName(f.name));
        } else {
          say("error", t("pdf.notSupported", { name: f.name }));
        }
      } catch (e) {
        say("error", e instanceof PdfError && e.code === "ENCRYPTED" ? t("pdf.encrypted", { name: f.name }) : t("pdf.unreadable", { name: f.name }));
      }
    }
  };

  const removeSource = (id: string) => {
    setSources((s) => s.filter((x) => x.id !== id));
    setPages((p) => p.filter((x) => x.src !== id));
    setSelected((sel) => sel.filter((k) => !k.startsWith(`${id}:`)));
  };
  const clear = () => {
    setSources([]); setPages([]); setThumbs({}); setSelected([]); setName(""); setMessage(null);
  };

  const at = (key: string) => pages.findIndex((p) => p.key === key);
  const turn = (key: string, by: 90 | -90) => setPages((ps) => ps.map((p) => (p.key === key ? { ...p, rotation: rotate(p.rotation, by) } : p)));
  const drop = (key: string) => {
    setPages((ps) => ps.filter((p) => p.key !== key));
    setSelected((s) => s.filter((k) => k !== key));
  };
  const shift = (key: string, by: 1 | -1) => setPages((ps) => move(ps, at(key), at(key) + by));
  const toggle = (key: string) => setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  const save = async (what: "all" | "selected" | "split") => {
    const list = what === "selected" ? pages.filter((p) => selected.includes(p.key)) : pages;
    const opts = { watermark, pageNumbers: numbers, title: name || undefined };
    const stem = baseName(name || "document");
    setBusy(what);
    setMessage(null);
    try {
      if (what === "split") {
        const parts = await splitPdf(sources, list, opts);
        let last = "";
        for (const [i, part] of parts.entries()) last = await toolsNative.saveFile(`${stem} - ${String(i + 1).padStart(2, "0")}.pdf`, toBase64(part));
        say("ok", t("pdf.savedMany", { n: parts.length, where: last.replace(/[^/\\]+$/, "") }));
      } else {
        const bytes = await buildPdf(sources, list, opts);
        const path = await toolsNative.saveFile(`${stem}${what === "selected" ? " - pages" : ""}.pdf`, toBase64(bytes));
        say("ok", t("pdf.saved", { path, size: (bytes.length / 1024 / 1024).toFixed(bytes.length > 1024 * 1024 ? 1 : 2) }));
      }
    } catch (e) {
      say("error", e instanceof PdfError ? e.message : String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const srcName = (id: string) => sources.find((s) => s.id === id)?.name ?? "";
  const empty = pages.length === 0;

  return (
    <div
      className={`pdf${over ? " over" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          setOver(false);
          void add(e.dataTransfer.files);
        }
      }}
    >
      <input ref={file} type="file" accept="application/pdf,.pdf,image/*" multiple hidden onChange={(e) => { if (e.target.files) void add(e.target.files); e.target.value = ""; }} />
      {empty ? (
        <button className="pdf-drop" onClick={() => file.current?.click()}>
          <FilePlus2 size={30} />
          <strong>{t("pdf.add")}</strong>
          <span className="muted small">{t("pdf.addHint")}</span>
          <span className="muted small">{t("pdf.private")}</span>
        </button>
      ) : (
        <>
          <div className="pdf-files">
            {sources.map((s) => (
              <span key={s.id} className="chip">
                {s.name} <span className="muted">· {s.pageCount === 1 ? t("pdf.page1") : t("pdf.pages", { n: s.pageCount })}</span>
                <button className="link-btn" onClick={() => removeSource(s.id)} aria-label={t("pdf.remove", { name: s.name })}><X size={12} /></button>
              </span>
            ))}
            <button className="btn sm" onClick={() => file.current?.click()}><FilePlus2 size={13} /> {t("pdf.addMore")}</button>
            <span className="flex" />
            {selected.length > 0 && <button className="link-btn small" onClick={() => setSelected([])}>{t("pdf.clearSel", { n: selected.length })}</button>}
            <button className="btn sm" onClick={clear}><Trash2 size={13} /> {t("pdf.clear")}</button>
          </div>

          <ol className="pdf-grid" aria-label={t("pdf.pagesLabel")}>
            {pages.map((p, i) => {
              const sel = selected.includes(p.key);
              return (
                <li
                  key={p.key}
                  className={`pdf-page${sel ? " sel" : ""}${dragKey === p.key ? " dragging" : ""}`}
                  draggable
                  onDragStart={(e) => { setDragKey(p.key); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.key); }}
                  onDragEnd={() => setDragKey(null)}
                  onDragOver={(e) => { if (dragKey) e.preventDefault(); }}
                  onDrop={(e) => {
                    if (!dragKey) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setPages((ps) => move(ps, ps.findIndex((x) => x.key === dragKey), i));
                    setDragKey(null);
                  }}
                >
                  <button className="pdf-thumb" onClick={() => toggle(p.key)} aria-pressed={sel} aria-label={t("pdf.pageOf", { n: i + 1, name: srcName(p.src) })}>
                    {thumbs[p.key] ? (
                      <img src={thumbs[p.key]} alt="" style={{ transform: `rotate(${p.rotation}deg)` }} draggable={false} />
                    ) : (
                      <LoaderCircle size={16} className="spin muted" />
                    )}
                    <span className="pdf-num">{i + 1}</span>
                  </button>
                  <span className="pdf-tools">
                    <button onClick={() => shift(p.key, -1)} disabled={i === 0} aria-label={t("pdf.left")} title={t("pdf.left")}><ChevronLeft size={13} /></button>
                    <button onClick={() => turn(p.key, -90)} aria-label={t("pdf.turnLeft")} title={t("pdf.turnLeft")}><RotateCcw size={13} /></button>
                    <button onClick={() => turn(p.key, 90)} aria-label={t("pdf.turnRight")} title={t("pdf.turnRight")}><RotateCw size={13} /></button>
                    <button onClick={() => drop(p.key)} aria-label={t("pdf.delete")} title={t("pdf.delete")}><Trash2 size={13} /></button>
                    <button onClick={() => shift(p.key, 1)} disabled={i === pages.length - 1} aria-label={t("pdf.right")} title={t("pdf.right")}><ChevronRight size={13} /></button>
                  </span>
                  <span className="pdf-src muted" title={srcName(p.src)}>{srcName(p.src)}</span>
                </li>
              );
            })}
          </ol>

          <div className="pdf-options">
            <label className="field">
              <span>{t("pdf.name")}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="document" maxLength={60} />
            </label>
            <label className="field">
              <span>{t("pdf.watermark")}</span>
              <input value={watermark} onChange={(e) => setWatermark(e.target.value)} placeholder={t("pdf.watermarkHint")} maxLength={40} />
            </label>
            <label className="switch-row">
              <input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} /> {t("pdf.numbers")}
            </label>
          </div>
        </>
      )}

      {message && <p className={message.kind === "ok" ? "pdf-ok" : "field-error"} role={message.kind === "ok" ? "status" : "alert"}>{message.text}</p>}

      {!empty && (
        <div className="pdf-actions">
          <span className="muted small">{pages.length === 1 ? t("pdf.page1") : t("pdf.count", { n: pages.length })}</span>
          <span className="flex" />
          <button className="btn sm" disabled={!!busy || pages.length < 2} onClick={() => void save("split")}>
            {busy === "split" ? <LoaderCircle size={13} className="spin" /> : <Scissors size={13} />} {t("pdf.split")}
          </button>
          {selected.length > 0 && (
            <button className="btn sm" disabled={!!busy} onClick={() => void save("selected")}>
              {busy === "selected" ? <LoaderCircle size={13} className="spin" /> : <FileStack size={13} />} {t("pdf.saveSelected", { n: selected.length })}
            </button>
          )}
          <button className="btn sm primary" disabled={!!busy} onClick={() => void save("all")}>
            {busy === "all" ? <LoaderCircle size={13} className="spin" /> : <FileStack size={13} />} {t("pdf.save")}
          </button>
        </div>
      )}
    </div>
  );
}
