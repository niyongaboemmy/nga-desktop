import { webkit } from "playwright";
import fs from "node:fs";
const SHOTS = new URL("../shots", import.meta.url).pathname;
const FX = new URL("../.fx", import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(FX, { recursive: true });
const mock = fs.readFileSync(new URL("../mock.js", import.meta.url), "utf8");
const theme = process.argv[2] || "dark";
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 1320, height: 840 } });
await ctx.addInitScript(`localStorage.setItem("nga.theme", ${JSON.stringify(theme)}); localStorage.setItem("mock.persona", "student");`);
await ctx.addInitScript(mock);
const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
const r = []; const ok = (n, c, d = "") => r.push(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`);
await p.goto("http://localhost:1420/?overlay=1"); await p.waitForTimeout(300);
const open = async (id) => { await p.evaluate((v) => window.__mockEmit("nga://overlay", v), `tool:${id}`); await p.waitForTimeout(500); };
const shot = (n) => p.screenshot({ path: `${SHOTS}/study-${theme}-${n}.png` });

await open("graph");
await p.waitForSelector(".graph-canvas");
await p.waitForTimeout(300);
const pts = await p.locator(".graph-points li").allTextContents();
ok("graph finds zeros of x^2-4", pts.includes("(-2, 0)") && pts.includes("(2, 0)"), pts.join(" "));
ok("graph finds the intersection with a*x+b", pts.some((t) => /^\((-1\.56|2\.56|-1\.79|2\.79)/.test(t)), pts.join(" "));
const ink = await p.$eval(".graph-canvas", (c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
ok("graph draws", ink > 5000, `${ink} px`);
await p.locator(".param input").first().fill("3");
await p.waitForTimeout(200);
const pts2 = await p.locator(".graph-points li").allTextContents();
ok("sliders move the line", pts2.join() !== pts.join(), pts2.join(" "));
await shot("01-graph");

await open("periodic");
await p.click('.pt-cell[data-z="26"]');
ok("element card shows iron", (await p.locator(".pt-facts > strong").textContent()) === "Iron" && (await p.locator(".pt-facts").textContent()).includes("Period 4, group 8"));
await p.fill(".mm input", "CuSO4·5H2O");
ok("molar mass of CuSO4·5H2O", (await p.locator(".mm-result strong").textContent()).startsWith("249.69"));
await p.fill(".mm input", "Ca(OH");
ok("bad formula explained", (await p.locator(".periodic .field-error").textContent()).includes("brackets"));
await p.fill(".pt-top input", "gold");
ok("search highlights gold", (await p.locator(".pt-cell:not(.dim)").count()) === 1);
await p.fill(".pt-top input", "");
await p.fill(".mm input", "H2SO4");
await shot("02-periodic");

await open("formulas");
await p.fill(".formulas .tool-search input", "ohm");
ok("formula search finds Ohm's law", (await p.locator(".f-card").count()) >= 1 && (await p.locator(".f-card .katex").count()) >= 1);
await p.fill(".formulas .tool-search input", "");
await p.click('.formulas-bar button:has-text("Physics")');
await shot("03-formulas");

await open("cards");
await p.click('.cards .btn.primary');
await p.click('button:has-text("Paste many")');
await p.fill(".list-editor textarea", "H2O | water\nNaCl | table salt\nCO2 | carbon dioxide");
await p.click('button:has-text("Add 3 cards")');
ok("3 cards added", (await p.locator(".card-list li").count()) === 3);
await p.click('button:has-text("Study 3 cards")');
for (let i = 0; i < 3; i++) {
  await p.click(".flash");
  await p.waitForSelector(".rates");
  if (i === 0) await shot("04-flashcard");
  await p.click(".rate-good");
}
ok("study session finishes", (await p.locator(".study-done").count()) === 1);
await p.click('button:has-text("Back to the deck")');
ok("no cards left to study now", (await p.locator(".result-card.big strong").textContent()) === "0");

console.log(r.join("\n")); console.log(errs.length ? "ERRORS " + errs.join(" | ") : "no page errors");
await b.close();
