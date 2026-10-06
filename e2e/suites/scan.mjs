import { webkit } from "playwright";
import { createRequire } from "node:module";
import fs from "node:fs";
const SHOTS = new URL("../shots", import.meta.url).pathname;
const FX = new URL("../.fx", import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(FX, { recursive: true });
const { PDFDocument } = createRequire(import.meta.url)("pdf-lib");
const mock = fs.readFileSync(new URL("../mock.js", import.meta.url), "utf8");
const theme = process.argv[2] || "dark";
const r = (n, c, d = "") => console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`);
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 1320, height: 840 } });
await ctx.addInitScript(`localStorage.setItem("nga.theme", ${JSON.stringify(theme)});`);
await ctx.addInitScript(mock);
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:1420/?overlay=1"); await p.waitForTimeout(300);
await p.evaluate(() => window.__mockEmit("nga://overlay", "tool:scanner")); await p.waitForSelector(".scan-start", { timeout: 10000 });
await p.click(".scan-choice >> nth=0"); await p.waitForTimeout(800);
const scanText = await p.locator(".scan").innerText();
const camOpen = (await p.locator(".scan-camera video").count()) === 1;
const camErr = scanText.includes("choose a photo instead");
const camWait = scanText.includes("Opening the camera");
r("camera opens, waits for permission, or its absence is explained", camOpen || camErr || camWait, camOpen ? "camera view" : camWait ? "waiting" : camErr ? "explained" : "nothing");
if (camOpen) await p.click('.scan-camera button:has-text("Cancel")');
if (camWait) await p.click('.scan-camera button:has-text("Cancel")');
await p.setInputFiles('.scan input[type="file"]', FX + "/page-photo.jpg");
await p.waitForSelector(".scan-stage img", { timeout: 5000 });
// Drag each handle onto the page's real corners (photo 1200×900).
const quad = [[260, 120], [930, 170], [980, 800], [200, 760]];
const box = await p.locator(".scan-stage").boundingBox();
for (let i = 0; i < 4; i++) {
  const h = await p.locator(".scan-handle").nth(i).boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down();
  await p.mouse.move(box.x + (quad[i][0] / 1200) * box.width, box.y + (quad[i][1] / 900) * box.height, { steps: 6 }); await p.mouse.up();
}
await p.click('.scan-bar button:has-text("Black & white")');
await p.screenshot({ path: `${SHOTS}/scan-${theme}-adjust.png` });
await p.click('.scan-bar button:has-text("Add page")');
await p.waitForSelector(".scan-pages li", { timeout: 15000 });
// The straightened page: mostly white, with dark text lines; the dark desk is gone.
const stats = await p.evaluate(async () => {
  const img = document.querySelector(".scan-pages img");
  await img.decode(); const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
  let white = 0, black = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i]; if (v > 200) white++; else if (v < 60) black++; }
  const n = d.length / 4; return { w: c.width, h: c.height, white: Math.round((white / n) * 100), black: Math.round((black / n) * 100) };
});
r("page straightened and cleaned (mostly white, some ink, page proportions)", stats.white > 75 && stats.black > 3 && Math.abs(stats.w / stats.h - 782 / 641) < 0.08, JSON.stringify(stats));
await p.setInputFiles('.scan input[type="file"]', FX + "/page-photo.jpg");
await p.waitForSelector(".scan-stage img"); await p.click('.scan-bar button:has-text("Add page")');
await p.waitForFunction(() => document.querySelectorAll(".scan-pages li").length === 2, null, { timeout: 15000 });
const auto = await p.evaluate(async () => {
  const img = document.querySelectorAll(".scan-pages img")[1];
  await img.decode(); const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
  let dark = 0, n = 0; for (let x = 4; x < c.width - 4; x++) for (const y of [4, c.height - 5]) { const i = (y * c.width + x) * 4; n++; if (d[i] < 120) dark++; }
  return Math.round((dark / n) * 100);
});
r("page found automatically (no desk left at the edges)", auto < 15, `${auto}% dark edge`);
await p.fill(".scan-name input", "Chemistry homework");
await p.click('.pdf-actions button:has-text("Save 2 pages as PDF")'); await p.waitForSelector(".pdf-ok", { timeout: 10000 });
const saved = (await p.evaluate(() => window.__saved)).at(-1);
const doc = await PDFDocument.load(Buffer.from(saved.data, "base64"));
r("saved a 2-page PDF with the given name", doc.getPageCount() === 2 && saved.name === "Chemistry homework.pdf", saved.name);
await p.screenshot({ path: `${SHOTS}/scan-${theme}-pages.png` });
r("no page errors", errs.length === 0, errs.join(" | "));
await b.close();
