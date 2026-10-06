// Open every game, dismiss the rules, interact a little, screenshot (both themes), collect errors.
import { webkit } from "playwright";
import fs from "node:fs";
const SHOTS = new URL("../shots", import.meta.url).pathname;
const FX = new URL("../.fx", import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(FX, { recursive: true });
const mock = fs.readFileSync(new URL("../mock.js", import.meta.url), "utf8");
const only = process.argv.slice(3);
const theme = process.argv[2] || "dark";
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 1320, height: 840 } });
await ctx.addInitScript(`localStorage.setItem("nga.theme", ${JSON.stringify(theme)}); localStorage.setItem("mock.persona","student"); localStorage.setItem("mock.policy","open");`);
await ctx.addInitScript(mock);
const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto("http://localhost:1420/?overlay=1"); await p.waitForTimeout(300);
await p.evaluate(() => window.__mockEmit("nga://overlay", "tool:games"));
await p.waitForSelector(".games");
const names = { "number-place": "Number Place", "picture-logic": "Picture Logic", "lights-out": "Lights Out", mines: "Mines", "sliding-15": "Sliding Tiles", pairs: "Pairs", echo: "Echo", "five-letter": "Five-Letter Guess", "word-search": "Word Search", "math-sprint": "Math Sprint", "code-breaker": "Code Breaker", "four-in-a-row": "Four in a Row", snake: "Snake" };
for (const [id, name] of Object.entries(names)) {
  if (only.length && !only.includes(id)) continue;
  const before = errs.length;
  await p.click(`.game-card:has-text("${name}")`);
  await p.waitForSelector(".game-veil-card.help", { timeout: 4000 }).catch(() => {});
  await p.click('button:has-text("Got it")').catch(() => {});
  await p.waitForTimeout(400);
  const box = await p.locator(".game-stage").boundingBox();
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  for (const k of ["ArrowRight", "ArrowDown", "Enter", "1"]) await p.keyboard.press(k);
  await p.waitForTimeout(500);
  const sw = await p.evaluate(() => { const s = document.querySelector(".modal-body"); return s ? s.scrollWidth - s.clientWidth : 0; });
  await p.screenshot({ path: `${SHOTS}/g-${theme}-${id}.png` });
  console.log(`${id}: ${errs.length > before ? "ERRORS " + errs.slice(before).join(" | ") : "ok"}${sw > 2 ? " HSCROLL " + sw : ""}`);
  await p.click('.game-bar .icon-btn[aria-label="All games"]');
  await p.waitForTimeout(200);
}
await b.close();
