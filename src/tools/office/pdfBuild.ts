// PDF tools, the pure part (pdf-lib, MIT): build one PDF from pages of several PDFs
// and images — in any order, rotated, some left out — with an optional watermark
// and page numbers; or split pages into separate files. Nothing leaves the computer.
import { PDFDocument, StandardFonts, degrees, rgb, type PDFPage } from "pdf-lib";

export interface Source {
  id: string;
  name: string;
  kind: "pdf" | "image";
  bytes: Uint8Array;
  /** Images: "image/png" or "image/jpeg" (other formats are converted to PNG first). */
  mime?: string;
  pageCount: number;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface PageRef {
  /** Stable key for lists and drag and drop. */
  key: string;
  src: string;
  /** Page index inside its source (0 for images). */
  index: number;
  rotation: Rotation;
}

export interface BuildOptions {
  watermark?: string;
  pageNumbers?: boolean;
  title?: string;
}

export class PdfError extends Error {
  constructor(message: string, readonly code: "ENCRYPTED" | "BROKEN" | "EMPTY" | "IMAGE") {
    super(message);
  }
}

/** A4 in PDF points. */
const A4: [number, number] = [595.28, 841.89];
const MARGIN = 24;

/** Open a PDF to read its pages; refuses password-protected files (they would come out blank). */
export async function openPdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/encrypt/i.test(msg)) throw new PdfError("This PDF is password-protected.", "ENCRYPTED");
    throw new PdfError("This file isn't a PDF that can be read.", "BROKEN");
  }
}

export const pageRefs = (src: Source): PageRef[] =>
  Array.from({ length: src.pageCount }, (_, index) => ({ key: `${src.id}:${index}`, src: src.id, index, rotation: 0 as Rotation }));

export const rotate = (r: Rotation, by: 90 | -90): Rotation => (((r + by + 360) % 360) as Rotation);

/** Move one item from → to (array copy). */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  const a = list.slice();
  if (from < 0 || from >= a.length || to < 0 || to >= a.length || from === to) return a;
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
}

function stamp(page: PDFPage, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, opts: BuildOptions, n: number, total: number) {
  const { width, height } = page.getSize();
  const text = opts.watermark?.trim();
  if (text) {
    const size = Math.min(72, (Math.hypot(width, height) * 0.8) / Math.max(4, text.length) / 0.55);
    const w = font.widthOfTextAtSize(text, size);
    const angle = Math.atan2(height, width);
    // Centre the diagonal text on the page.
    const x = width / 2 - (Math.cos(angle) * w) / 2 + (Math.sin(angle) * size) / 3;
    const y = height / 2 - (Math.sin(angle) * w) / 2 - (Math.cos(angle) * size) / 3;
    page.drawText(text, { x, y, size, font, color: rgb(0.45, 0.45, 0.45), opacity: 0.18, rotate: degrees((angle * 180) / Math.PI) });
  }
  if (opts.pageNumbers) {
    const label = `${n} / ${total}`;
    const size = 10;
    page.drawText(label, { x: width / 2 - font.widthOfTextAtSize(label, size) / 2, y: 18, size, font, color: rgb(0.35, 0.35, 0.35) });
  }
}

/** One PDF from the pages, in order. */
export async function buildPdf(sources: Source[], pages: PageRef[], opts: BuildOptions = {}): Promise<Uint8Array> {
  if (!pages.length) throw new PdfError("There are no pages to save.", "EMPTY");
  const out = await PDFDocument.create();
  const byId = new Map(sources.map((s) => [s.id, s]));
  const docs = new Map<string, PDFDocument>();
  const added: PDFPage[] = [];
  for (const ref of pages) {
    const src = byId.get(ref.src);
    if (!src) continue;
    if (src.kind === "pdf") {
      let doc = docs.get(src.id);
      if (!doc) docs.set(src.id, (doc = await openPdf(src.bytes)));
      const [p] = await out.copyPages(doc, [ref.index]);
      p.setRotation(degrees((p.getRotation().angle + ref.rotation) % 360));
      added.push(out.addPage(p));
    } else {
      let img;
      try {
        img = src.mime === "image/jpeg" ? await out.embedJpg(src.bytes) : await out.embedPng(src.bytes);
      } catch {
        throw new PdfError(`"${src.name}" couldn't be read as a picture.`, "IMAGE");
      }
      // Portrait or landscape A4, whichever suits the picture; fitted inside a margin.
      const landscape = img.width > img.height;
      const [pw, ph] = landscape ? [A4[1], A4[0]] : A4;
      const scale = Math.min((pw - 2 * MARGIN) / img.width, (ph - 2 * MARGIN) / img.height);
      const w = img.width * scale, h = img.height * scale;
      const p = out.addPage([pw, ph]);
      p.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
      if (ref.rotation) p.setRotation(degrees(ref.rotation));
      added.push(p);
    }
  }
  if (opts.watermark?.trim() || opts.pageNumbers) {
    const font = await out.embedFont(StandardFonts.HelveticaBold);
    added.forEach((p, i) => stamp(p, font, opts, i + 1, added.length));
  }
  out.setProducer("NGA Desktop");
  out.setCreator("NGA Desktop PDF tools");
  if (opts.title) out.setTitle(opts.title);
  return out.save({ useObjectStreams: true });
}

/** Each page as its own PDF. */
export async function splitPdf(sources: Source[], pages: PageRef[], opts: BuildOptions = {}): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (const p of pages) out.push(await buildPdf(sources, [p], { ...opts, pageNumbers: false }));
  return out;
}

/** "Lesson notes.pdf" → "Lesson notes"; keeps a safe, short base name. */
export function baseName(name: string): string {
  const stem = name.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[^\p{L}\p{N} _-]+/gu, "-").replace(/-+/g, "-").replace(/^[-\s]+|[-\s]+$/g, "");
  return (stem || "document").slice(0, 60);
}

/** Bytes → base64, in chunks (large PDFs). */
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
