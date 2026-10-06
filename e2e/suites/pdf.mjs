import { webkit } from "playwright";
import { createRequire } from "node:module";
const { PDFDocument, StandardFonts } = createRequire(import.meta.url)("pdf-lib");
import fs from "node:fs";
const SHOTS = new URL("../shots", import.meta.url).pathname;
const FX = new URL("../.fx", import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(FX, { recursive: true });
const mock = fs.readFileSync(new URL("../mock.js", import.meta.url), "utf8");
const theme = process.argv[2] || "dark";
const r = (n, c, d = "") => console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`);
// Fixtures: a 3-page and a 2-page PDF with big page numbers, and a PNG.

async function mk(name, n, label) {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < n; i++) { const p = d.addPage([595, 842]); p.drawText(`${label}${i + 1}`, { x: 150, y: 400, size: 120, font: f }); }
  fs.writeFileSync(`${FX}/${name}`, await d.save());
}
await mk("lesson.pdf", 3, "A"); await mk("homework.pdf", 2, "B");
fs.writeFileSync(FX + "/photo.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwHwQZYAQAeuAH+Tl9v5gAAAAASUVORK5CYII=", "base64"));
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 1320, height: 840 } });
await ctx.addInitScript(`localStorage.setItem("nga.theme", ${JSON.stringify(theme)}); localStorage.setItem("mock.persona","student");`);
await ctx.addInitScript(mock);
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto("http://localhost:1420/?overlay=1"); await p.waitForTimeout(300);
await p.evaluate(() => window.__mockEmit("nga://overlay", "tool:pdf")); await p.waitForSelector(".pdf-drop");
await p.screenshot({ path: `${SHOTS}/pdf-${theme}-0.png` });
await p.setInputFiles('.pdf input[type="file"]', [FX + "/lesson.pdf", FX + "/homework.pdf", FX + "/photo.png"]);
await p.waitForFunction(() => document.querySelectorAll(".pdf-page").length === 6, null, { timeout: 8000 });
await p.waitForFunction(() => document.querySelectorAll(".pdf-thumb img").length === 6, null, { timeout: 15000 }).catch(() => {});
r("6 pages with thumbnails", (await p.locator(".pdf-thumb img").count()) === 6, String(await p.locator(".pdf-thumb img").count()));
// Delete A2, turn A3 right, move B1 to the front.
await p.locator(".pdf-page").nth(1).hover(); await p.locator('.pdf-page').nth(1).locator('button[aria-label="Remove page"]').click();
await p.locator(".pdf-page").nth(1).locator('button[aria-label="Turn right"]').click();
for (let i = 0; i < 2; i++) await p.locator(".pdf-page").nth(2 - i).locator('button[aria-label="Move earlier"]').click();
await p.fill('.pdf-options input >> nth=1', "DRAFT");
await p.check('.pdf-options input[type="checkbox"]');
await p.screenshot({ path: `${SHOTS}/pdf-${theme}-1.png` });
await p.click('.pdf-actions button:has-text("Save as one PDF")');
await p.waitForSelector(".pdf-ok", { timeout: 8000 });
const saved = await p.evaluate(() => window.__saved);
const doc = await PDFDocument.load(Buffer.from(saved[0].data, "base64"));
const sizes = doc.getPages().map((pg) => `${Math.round(pg.getWidth())}x${Math.round(pg.getHeight())}@${pg.getRotation().angle}`);
r("saved PDF: 5 pages, B1 first, A3 turned, picture landscape", doc.getPageCount() === 5 && sizes[2] === "595x842@90" && sizes[4] === "842x595@0", sizes.join(" "));
r("file named after the first file", saved[0].name === "lesson.pdf", saved[0].name);
// Select two pages and split.
await p.locator(".pdf-thumb").nth(0).click(); await p.locator(".pdf-thumb").nth(1).click();
await p.click('.pdf-actions button:has-text("Save 2 selected")'); await p.waitForTimeout(800);
const sel = await PDFDocument.load(Buffer.from((await p.evaluate(() => window.__saved))[1].data, "base64"));
r("selected pages saved", sel.getPageCount() === 2);
await p.click('.pdf-actions button:has-text("Split into pages")'); await p.waitForTimeout(1500);
const all = await p.evaluate(() => window.__saved.map((s) => s.name));
r("split saves one file per page", all.length === 2 + 5 && all.at(-1) === "lesson - 05.pdf", all.slice(2).join(", "));
// A broken file is explained.
fs.writeFileSync(FX + "/broken.pdf", "not a pdf");
await p.setInputFiles('.pdf input[type="file"]', [FX + "/broken.pdf"]); await p.waitForTimeout(500);
r("broken file explained", ((await p.locator(".pdf .field-error").textContent().catch(() => "")) || "").includes("couldn't be read"));
r("no page errors", errs.length === 0, errs.join(" | "));
await b.close();
