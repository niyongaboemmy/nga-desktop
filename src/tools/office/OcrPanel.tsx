import { useEffect, useRef, useState } from "react";
import { Copy, FileText, LoaderCircle, ScanText } from "lucide-react";
import { joinPages, recognize, stopOcr, type OcrLang } from "./ocr";
import { baseName } from "./pdfBuild";
import { textToBase64, toolsNative } from "../shared/native";
import type { Translate } from "../i18n";

const LANGS: Array<{ id: OcrLang; key: "ocr.eng" | "ocr.fra" | "ocr.both" }> = [
  { id: "eng", key: "ocr.eng" },
  { id: "fra", key: "ocr.fra" },
  { id: "eng+fra", key: "ocr.both" },
];

/** Text from the scanned pages (OCR), on this computer. */
export function OcrPanel({ images, name, t, lang: uiLang }: { images: Blob[]; name: string; t: Translate; lang: string }) {
  const [lang, setLang] = useState<OcrLang>(uiLang === "fr" ? "fra" : "eng");
  const [busy, setBusy] = useState<{ page: number; p: number } | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [low, setLow] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopOcr();
    };
  }, []);

  const run = async () => {
    setBusy({ page: 0, p: 0 });
    setNote(null);
    try {
      const res = await recognize(images, lang, (page, p) => alive.current && setBusy({ page, p }));
      if (!alive.current) return;
      setText(joinPages(res.map((r) => r.text), (n) => t("ocr.pageHeading", { n })));
      setLow(res.some((r) => r.confidence < 60));
    } catch (e) {
      if (alive.current) setNote(t("ocr.failed", { error: String((e as Error)?.message ?? e).slice(0, 120) }));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setNote(t("ocr.copied"));
    } catch {
      setNote(t("ocr.copyFailed"));
    }
  };
  const save = async () => {
    if (!text) return;
    const path = await toolsNative.saveFile(`${baseName(name || t("scan.defaultName"))}.txt`, textToBase64(text));
    setNote(t("ocr.saved", { path }));
  };

  const pct = busy ? Math.round(((busy.page + busy.p) / images.length) * 100) : 0;
  return (
    <section className="ocr" aria-label={t("ocr.title")}>
      <div className="ocr-bar">
        <strong><ScanText size={15} /> {t("ocr.title")}</strong>
        <div className="segmented-sm" role="group" aria-label={t("ocr.language")}>
          {LANGS.map((l) => <button key={l.id} className={lang === l.id ? "on" : ""} aria-pressed={lang === l.id} onClick={() => setLang(l.id)} disabled={!!busy}>{t(l.key)}</button>)}
        </div>
        <span className="flex" />
        <button className="btn sm" disabled={!!busy || images.length === 0} onClick={() => void run()}>
          {busy ? <LoaderCircle size={13} className="spin" /> : <ScanText size={13} />} {text ? t("ocr.again") : t("ocr.run", { n: images.length })}
        </button>
      </div>
      {busy && (
        <div className="ocr-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
          <small className="muted">{t("ocr.progress", { page: busy.page + 1, total: images.length })}</small>
        </div>
      )}
      {text !== null && !busy && (
        <>
          {low && <p className="muted small">{t("ocr.lowConfidence")}</p>}
          <textarea className="ocr-text" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label={t("ocr.title")} />
          <div className="row">
            <button className="btn sm" onClick={() => void copy()}><Copy size={13} /> {t("ocr.copy")}</button>
            <button className="btn sm" onClick={() => void save()}><FileText size={13} /> {t("ocr.saveTxt")}</button>
          </div>
        </>
      )}
      {note && <p className="muted small" role="status">{note}</p>}
      {text === null && !busy && <p className="muted small">{t("ocr.hint")}</p>}
    </section>
  );
}
