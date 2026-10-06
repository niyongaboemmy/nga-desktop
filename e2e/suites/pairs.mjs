import { webkit } from "playwright";
import fs from "node:fs";
const SHOTS = new URL("../shots", import.meta.url).pathname;
const FX = new URL("../.fx", import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(FX, { recursive: true });
const mock = fs.readFileSync(new URL("../mock.js", import.meta.url), "utf8");
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 1320, height: 840 } });
await ctx.addInitScript(`localStorage.setItem("nga.theme","dark");localStorage.setItem("mock.persona","student");localStorage.setItem("mock.policy","open");`);
await ctx.addInitScript(mock);
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:1420/?overlay=1"); await p.waitForTimeout(300);
await p.evaluate(() => window.__mockEmit("nga://overlay", "tool:games"));
await p.click('.game-card:has-text("Pairs")'); await p.click('button:has-text("Got it")');
await p.click('.prs .segmented-sm button:has-text("12 cards")');
const r = (n, c, d = "") => console.log(`${c ? "PASS" : "FAIL"} ${n} ${d}`);
r("all face down", (await p.locator(".prs-face").count()) === 0 && (await p.locator(".prs-back").count()) === 12);
// Read the deal from the saved state and play it perfectly.
const st = await p.evaluate(() => JSON.parse(localStorage.getItem("mock.state")).stores["tools-u42.json"]["games.save.pairs"]);
await p.locator(".prs-card").nth(0).click();
const mis = st.cards.findIndex((c) => c.pair !== st.cards[0].pair);
await p.locator(".prs-card").nth(mis).click();
r("mismatch shows two faces", (await p.locator(".prs-face").count()) === 2);
await p.screenshot({ path: `${SHOTS}/pairs-open.png` });
await p.waitForTimeout(1200);
r("mismatch turns back", (await p.locator(".prs-face").count()) === 0);
const done = new Set();
for (let i = 0; i < st.cards.length; i++) {
  if (done.has(i)) continue;
  const j = st.cards.findIndex((c, k) => k !== i && c.pair === st.cards[i].pair);
  await p.locator(".prs-card").nth(i).click(); await p.locator(".prs-card").nth(j).click();
  done.add(i); done.add(j);
}
await p.waitForTimeout(300);
r("finished", ((await p.locator(".prs-status").textContent()) || "").includes("All pairs found in 7 moves"), await p.locator(".prs-status").textContent());
await p.screenshot({ path: `${SHOTS}/pairs-done.png` });
r("no errors", errs.length === 0, errs.join("|"));
await b.close();
