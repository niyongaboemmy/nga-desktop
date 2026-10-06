// Page thumbnails with pdf.js (Apache-2.0), in its own worker bundled with the app.
// The worker is built as a plain .js chunk (Vite ?worker): the app's own scheme
// doesn't serve .mjs files with a JavaScript type, so a module worker from the
// .mjs file never starts. If the worker still doesn't answer, pdf.js runs on the
// page instead (slower for big files, but it always works).
import * as pdfjs from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

let ready: Promise<void> | null = null;
/** How pdf.js runs here (for the self-test): "worker", "main", or why neither. */
export const pdfMode = { value: "unset", detail: "" };

/** A working pdf.js: its worker if it answers within 4 s, else the main thread. */
function setup(): Promise<void> {
  ready ??= (async () => {
    try {
      const port = new PdfWorker();
      const worker = new pdfjs.PDFWorker({ port: port as never });
      await Promise.race([worker.promise, new Promise((_, reject) => setTimeout(() => reject(new Error("worker silent")), 4000))]);
      pdfjs.GlobalWorkerOptions.workerPort = port;
      worker.destroy();
      pdfMode.value = "worker";
    } catch (e) {
      pdfMode.detail = String((e as Error)?.message ?? e);
      // Main thread: loading the worker code here registers globalThis.pdfjsWorker.
      await import("pdfjs-dist/build/pdf.worker.min.mjs");
      pdfMode.value = "main";
    }
  })();
  return ready;
}

/** Switch pdf.js to the main thread for good (the worker didn't answer). */
async function useMainThread(reason: string) {
  pdfMode.value = "main";
  pdfMode.detail = reason;
  pdfjs.GlobalWorkerOptions.workerPort = null;
  await import("pdfjs-dist/build/pdf.worker.min.mjs");
}

/**
 * Open a document; if the worker doesn't answer within 8 s (seen once on a cold
 * first launch in the app), drop it and open the document on the main thread.
 */
async function openDoc(bytes: Uint8Array) {
  // pdf.js takes ownership of the buffer it is given: pass a copy each time.
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false });
  if (pdfMode.value === "main") return task.promise;
  try {
    return await Promise.race([task.promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("worker didn't answer")), 8000))]);
  } catch (e) {
    void task.destroy();
    if ((e as Error)?.message !== "worker didn't answer") throw e;
    await useMainThread("worker stalled");
    return pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  }
}

/** Renders each page small and hands back a JPEG data URL (the shell's CSP allows data: images). */
export async function renderThumbs(bytes: Uint8Array, width: number, onThumb: (index: number, url: string) => void, signal?: { cancelled: boolean }): Promise<void> {
  await setup();
  const doc = await openDoc(bytes);
  try {
    for (let i = 0; i < doc.numPages; i++) {
      if (signal?.cancelled) return;
      const page = await doc.getPage(i + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (width * 2) / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      onThumb(i, canvas.toDataURL("image/jpeg", 0.72));
      page.cleanup();
    }
  } finally {
    void doc.destroy();
  }
}

/** Any picture the webview can show → PNG or JPEG bytes pdf-lib can embed, plus a thumbnail. */
export async function readImage(file: File, width: number): Promise<{ bytes: Uint8Array; mime: "image/png" | "image/jpeg"; thumb: string }> {
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("unreadable picture"));
    i.src = url;
  });
  const thumbCanvas = document.createElement("canvas");
  const s = (width * 2) / img.naturalWidth;
  thumbCanvas.width = Math.max(1, Math.round(img.naturalWidth * s));
  thumbCanvas.height = Math.max(1, Math.round(img.naturalHeight * s));
  const tctx = thumbCanvas.getContext("2d")!;
  // JPEG has no transparency: paint white first, as the PDF page will be.
  tctx.fillStyle = "#fff";
  tctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
  tctx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
  const thumb = thumbCanvas.toDataURL("image/jpeg", 0.72);
  if (file.type === "image/png" || file.type === "image/jpeg") {
    return { bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type, thumb };
  }
  // WebP, GIF, BMP…: redraw as PNG.
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d")!.drawImage(img, 0, 0);
  const blob = await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), "image/png"));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: "image/png", thumb };
}
