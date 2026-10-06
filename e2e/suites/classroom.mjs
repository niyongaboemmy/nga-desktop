import { chromium } from "playwright";
import fs from "node:fs";
const SHOTS = new URL("../shots", import.meta.url).pathname;
const FX = new URL("../.fx", import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(FX, { recursive: true });
const mock = fs.readFileSync(new URL("../mock.js", import.meta.url), "utf8");
const theme = process.argv[2] || "dark";
const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const r = []; const ok = (n, c, d = "") => r.push(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`);
const errs = [];
async function page(persona) {
  const ctx = await b.newContext({ viewport: { width: 1320, height: 840 }, permissions: ["microphone"] });
  await ctx.addInitScript(`localStorage.setItem("nga.theme", ${JSON.stringify(theme)}); localStorage.setItem("mock.persona", ${JSON.stringify(persona)});`);
  await ctx.addInitScript(mock);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:1420/?overlay=1");
  await p.waitForTimeout(300);
  return p;
}
const open = async (p, id) => { await p.evaluate((v) => window.__mockEmit("nga://overlay", v), `tool:${id}`); await p.waitForTimeout(450); };
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/class-${theme}-${n}.png` });

const p = await page("teacher");
await p.evaluate(() => window.__mockEmit("nga://overlay", "tools"));
await p.waitForSelector(".tool-tile");
const names = await p.locator(".tool-tile .tool-name").allTextContents();
ok("teacher sees the classroom kit", ["Name picker", "Group maker", "Noise meter", "Work-mode signs", "Classroom screen", "Whiteboard"].every((n) => names.some((x) => x.startsWith(n))), names.length + " tools");
await shot(p, "01-launcher");

// Name picker
await open(p, "picker");
await p.waitForSelector(".list-picker select option:has-text('S4 MPC')", { state: "attached" });
ok("class lists come from MIS", (await p.locator(".list-picker option").allTextContents()).some((t) => t.includes("S4 MPC · 12")));
const picked = new Set();
for (let i = 0; i < 12; i++) {
  await p.click(".picker .btn.primary");
  await p.waitForFunction(() => !document.querySelector(".pick-stage.rolling"), null, { timeout: 5000 });
  picked.add(await p.locator(".pick-name").textContent());
}
ok("fair mode: 12 picks = 12 different students", picked.size === 12, [...picked].join(","));
ok("round counter resets", (await p.locator(".picker .muted.small.center-text").textContent()).includes("0 of 12"));
await p.click(".picker .link-btn");
await p.click(".attendance button:has-text('Aline U.')");
ok("marking absent updates the count", (await p.locator(".picker .muted.small.center-text").textContent()).includes("of 11"));
await shot(p, "02-picker");

// Group maker
await open(p, "groups");
await p.waitForSelector(".groups .btn.primary");
await p.click(".groups .btn.primary");
await p.waitForSelector(".group-card");
const sizes = await p.$$eval(".group-card ul", (uls) => uls.map((u) => u.children.length));
ok("groups of 4 from 12 students", sizes.length === 3 && sizes.every((s) => s === 4), sizes.join(","));
await shot(p, "03-groups");

// Signs
await open(p, "signs");
await p.click(".sign-grid button:has-text('Group work')");
ok("sign shows", (await p.locator(".sign-text").textContent()) === "Group work");

// Noise (fake microphone)
await open(p, "noise");
await p.click(".noise-start .btn.primary");
await p.waitForSelector(".noise-meter");
// The fake microphone can take a moment to start: poll for up to 4 s.
let lvl = 0;
for (let i = 0; i < 20 && !lvl; i++) { await p.waitForTimeout(200); lvl = Number(await p.getAttribute(".noise-meter", "aria-valuenow")); }
ok("noise meter reads the (fake) microphone", lvl > 0, `level ${lvl}`);
await shot(p, "04-noise");
await p.click(".noise-settings .btn");

// Whiteboard
await open(p, "board");
await p.waitForSelector(".board-canvas");
const box = await p.locator(".board-canvas").boundingBox();
await p.mouse.move(box.x + 100, box.y + 100); await p.mouse.down(); await p.mouse.move(box.x + 300, box.y + 180, { steps: 8 }); await p.mouse.up();
await p.click('.board-bar button[aria-label="Rectangle"]');
await p.mouse.move(box.x + 350, box.y + 80); await p.mouse.down(); await p.mouse.move(box.x + 500, box.y + 200, { steps: 4 }); await p.mouse.up();
const inked = await p.$eval(".board-canvas", (c) => { const g = c.getContext("2d"); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
ok("drawing puts ink on the board", inked > 500, `${inked} px`);
await p.click('.board-bar button[aria-label="Undo"]');
const after = await p.$eval(".board-canvas", (c) => { const g = c.getContext("2d"); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
ok("undo removes the last shape", after < inked && after > 0);
await p.click('.board-bar button[aria-label="Save as image (PNG)"]');
await p.waitForSelector("text=Saved to Downloads");
ok("board exports a PNG", true);
await shot(p, "05-board");

// Grades
await open(p, "grades");
const inputs = p.locator(".grade-table tbody tr");
await inputs.nth(0).locator("input").nth(2).fill("15");
await inputs.nth(1).locator("input").nth(2).fill("12");
await p.waitForTimeout(150);
ok("weighted grade 67.5% (C)", (await p.locator(".result-card.big strong").textContent()) === "67.5%" && (await p.locator(".result-card.big span").textContent()).startsWith("C"));
ok("what's needed for 70%", (await p.locator(".grade-target p").textContent()).includes("71.7%"));
await shot(p, "06-grades");

// Classroom screen preview
await open(p, "classroom-screen");
ok("classroom screen offers presenting", (await p.locator(".cscreen-intro .btn.primary").count()) === 1);
await shot(p, "07-cscreen");

// Student: no classroom tools that need class lists
const s = await page("student");
await s.evaluate(() => window.__mockEmit("nga://overlay", "tools"));
await s.waitForSelector(".tool-tile");
const sn = await s.locator(".tool-tile .tool-name").allTextContents();
ok("students don't see teacher-only tools", !sn.some((n) => n.startsWith("Name picker") || n.startsWith("Group maker")) && sn.some((n) => n.startsWith("Whiteboard")) && sn.some((n) => n.startsWith("Grade calculator")));

// Present views
const pres = await b.newContext({ viewport: { width: 1280, height: 720 } });
await pres.addInitScript(`localStorage.setItem("nga.theme", ${JSON.stringify(theme)});`); await pres.addInitScript(mock);
const pp = await pres.newPage();
await pp.goto("http://localhost:1420/?tool=classroom-screen&present=1");
await pp.waitForTimeout(800);
await pp.screenshot({ path: `${SHOTS}/class-${theme}-08-cscreen-present.png` });
await pp.goto("http://localhost:1420/?tool=signs&present=1");
await pp.waitForTimeout(500);
await pp.screenshot({ path: `${SHOTS}/class-${theme}-09-signs-present.png` });

console.log(r.join("\n")); console.log(errs.length ? "ERRORS " + errs.join(" | ") : "no page errors");
await b.close();
