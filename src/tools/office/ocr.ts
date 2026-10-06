// Text from scanned pages (plan Phase 7.3): tesseract.js (Apache-2.0) with the
// engine and English/French models shipped in the app (/ocr, scripts/ocr-assets.mjs).
// Runs in a worker loaded from the app's own files (no blob: URLs, no CDN).

export type OcrLang = "eng" | "fra" | "eng+fra";

/** Joins words split across lines ("photo-\nsynthesis"), tidies spaces and blank lines. Pure. */
export function cleanText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pages joined with a heading per page (when there is more than one). Pure. */
export function joinPages(pages: string[], label: (n: number) => string): string {
  if (pages.length === 1) return pages[0];
  return pages.map((t, i) => `${label(i + 1)}\n\n${t}`).join("\n\n");
}

type Worker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;
let current: { lang: OcrLang; worker: Promise<Worker> } | null = null;

async function workerFor(lang: OcrLang, onProgress: (p: number) => void): Promise<Worker> {
  if (current?.lang === lang) return current.worker;
  const old = current;
  current = null;
  if (old) void old.worker.then((w) => w.terminate()).catch(() => undefined);
  const { createWorker, OEM } = await import("tesseract.js");
  const base = new URL("/ocr/", window.location.href).href;
  const worker = createWorker(lang, OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base.replace(/\/$/, ""),
    workerBlobURL: false,
    gzip: true,
    cacheMethod: "none",
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress(m.progress);
    },
  });
  current = { lang, worker };
  worker.catch(() => (current = null));
  return worker;
}

/** Recognise each image in turn; `onProgress(page, 0..1)`. */
export async function recognize(images: Array<Blob | HTMLCanvasElement>, lang: OcrLang, onProgress: (page: number, p: number) => void): Promise<Array<{ text: string; confidence: number }>> {
  let page = 0;
  const w = await workerFor(lang, (p) => onProgress(page, p));
  const out: Array<{ text: string; confidence: number }> = [];
  for (; page < images.length; page++) {
    onProgress(page, 0);
    const { data } = await w.recognize(images[page]);
    out.push({ text: cleanText(data.text), confidence: Math.round(data.confidence) });
    onProgress(page, 1);
  }
  return out;
}

/** Stops the engine (frees its memory) — e.g. when the tool closes. */
export function stopOcr() {
  const c = current;
  current = null;
  if (c) void c.worker.then((w) => w.terminate()).catch(() => undefined);
}
