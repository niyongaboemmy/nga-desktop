// Phase B: each person's tool data is encrypted on disk (src/tools/shared/vault.ts).
import { chromium } from "playwright";
import fs from "node:fs";
const mock = fs.readFileSync(new URL("../mock.js", import.meta.url), "utf8");
const results = [], errors = [];
const check = (n, ok, d = "") => results.push(`${ok ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1320, height: 840 } });
await ctx.addInitScript(`localStorage.setItem("mock.vault", "1");`);
await ctx.addInitScript(mock);
const page = async () => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await p.goto("http://localhost:1420/?overlay=1");
  await p.waitForTimeout(300);
  await p.evaluate(() => window.__mockEmit("nga://overlay", "tool:calculator"));
  await p.waitForSelector(".calc-input");
  return p;
};
const disk = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("mock.state")).stores["tools-u42.json"] || {});

const p = await page();
await p.fill(".calc-input", "6*7");
await p.press(".calc-input", "Enter");
await p.waitForTimeout(400);
const stored = (await disk(p))["calc.history"];
check("calculator history is written sealed", !!stored && stored.$v === 1 && typeof stored.ct === "string", JSON.stringify(stored).slice(0, 80));
check("…and the sum can't be read on disk", !JSON.stringify(stored).includes("6*7") && !JSON.stringify(stored).includes("42"));
await p.close();

const q = await page();
await q.click('button[aria-label="History"]');
await q.waitForTimeout(200);
check("it opens again after a restart", (await q.locator(".calc-history li").count()) === 1 && (await q.locator(".calc-history li").first().textContent()).includes("42"));

// An older plain value is sealed as soon as it is read.
await q.evaluate(() => {
  const st = JSON.parse(localStorage.getItem("mock.state"));
  st.stores["tools-u42.json"]["calc.mode"] = "rad";
  localStorage.setItem("mock.state", JSON.stringify(st));
});
await q.close();
const r = await page();
await r.waitForTimeout(400);
const mode = (await disk(r))["calc.mode"];
check("older plain values get sealed when read", !!mode && mode.$v === 1, JSON.stringify(mode).slice(0, 60));

console.log(results.join("\n"));
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no page errors");
await browser.close();
