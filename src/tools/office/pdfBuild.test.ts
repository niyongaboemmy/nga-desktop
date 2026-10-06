import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { PdfError, baseName, buildPdf, move, openPdf, pageRefs, rotate, splitPdf, toBase64, type Source } from "./pdfBuild";

// A 2×1 red PNG.
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwHwQZYAQAeuAH+Tl9v5gAAAAASUVORK5CYII="), (c) => c.charCodeAt(0));

async function pdf(sizes: Array<[number, number]>, rotated = 0): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (const s of sizes) d.addPage(s).setRotation(degrees(rotated));
  return d.save();
}

describe("PDF tools", () => {
  it("merges pages from several PDFs in a new order, rotated, some left out", async () => {
    const a: Source = { id: "a", name: "a.pdf", kind: "pdf", bytes: await pdf([[100, 200], [101, 201]]), pageCount: 2 };
    const b: Source = { id: "b", name: "b.pdf", kind: "pdf", bytes: await pdf([[300, 400], [301, 401], [302, 402]], 90), pageCount: 3 };
    let pages = [...pageRefs(a), ...pageRefs(b)];
    pages = pages.filter((p) => p.key !== "b:1"); // delete
    pages = move(pages, 3, 0); // b:2 first
    pages[1] = { ...pages[1], rotation: rotate(pages[1].rotation, 90) }; // a:0 turned right
    const out = await PDFDocument.load(await buildPdf([a, b], pages, { title: "Merged" }));
    expect(out.getPageCount()).toBe(4);
    expect(out.getPages().map((p) => Math.round(p.getWidth()))).toEqual([302, 100, 101, 300]);
    expect(out.getPages().map((p) => p.getRotation().angle)).toEqual([90, 90, 0, 90]);
    expect(out.getTitle()).toBe("Merged");
  });

  it("turns pictures into A4 pages, portrait or landscape", async () => {
    const img: Source = { id: "i", name: "photo.png", kind: "image", mime: "image/png", bytes: PNG, pageCount: 1 };
    const out = await PDFDocument.load(await buildPdf([img], pageRefs(img)));
    const [p] = out.getPages();
    expect([Math.round(p.getWidth()), Math.round(p.getHeight())]).toEqual([842, 595]); // wide picture → landscape
    await expect(buildPdf([{ ...img, bytes: new Uint8Array([1, 2, 3]) }], pageRefs(img))).rejects.toBeInstanceOf(PdfError);
  });

  it("adds a watermark and page numbers without changing the pages", async () => {
    const a: Source = { id: "a", name: "a.pdf", kind: "pdf", bytes: await pdf([[595, 842], [842, 595]]), pageCount: 2 };
    const plain = await buildPdf([a], pageRefs(a));
    const stamped = await buildPdf([a], pageRefs(a), { watermark: "DRAFT — NGA", pageNumbers: true });
    expect(stamped.length).toBeGreaterThan(plain.length);
    expect((await PDFDocument.load(stamped)).getPageCount()).toBe(2);
  });

  it("splits into one PDF per page", async () => {
    const a: Source = { id: "a", name: "a.pdf", kind: "pdf", bytes: await pdf([[10, 10], [20, 20], [30, 30]]), pageCount: 3 };
    const parts = await splitPdf([a], pageRefs(a));
    expect(parts).toHaveLength(3);
    for (const [i, part] of parts.entries()) {
      const d = await PDFDocument.load(part);
      expect([d.getPageCount(), Math.round(d.getPage(0).getWidth())]).toEqual([1, (i + 1) * 10]);
    }
  });

  it("explains files it can't use", async () => {
    await expect(openPdf(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ code: "BROKEN" });
    await expect(buildPdf([], [])).rejects.toMatchObject({ code: "EMPTY" });
  });

  it("helpers", () => {
    expect(move(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(move(["a", "b"], 5, 0)).toEqual(["a", "b"]);
    expect(rotate(270, 90)).toBe(0);
    expect(rotate(0, -90)).toBe(270);
    expect(baseName("Lesson notes (final).pdf")).toBe("Lesson notes -final");
    expect(baseName("../x.pdf")).toBe("x");
    expect(toBase64(new Uint8Array([104, 105]))).toBe("aGk=");
    expect(toBase64(new Uint8Array(100_000)).length).toBe(133_336);
  });
});
