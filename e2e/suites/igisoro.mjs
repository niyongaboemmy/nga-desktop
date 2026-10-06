import { webkit } from "playwright";
import fs from "node:fs";
const SHOTS = new URL("../shots", import.meta.url).pathname;
const FX = new URL("../.fx", import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(FX, { recursive: true });
const mock = fs.readFileSync(new URL("../mock.js", import.meta.url), "utf8");
const b = await webkit.launch();
for (const theme of ["dark", "light"]) {
  const ctx = await b.newContext({ viewport: { width: 1320, height: 840 } });
  await ctx.addInitScript(`localStorage.setItem("nga.theme",${JSON.stringify(theme)});localStorage.setItem("mock.persona","student");localStorage.setItem("mock.policy","igisoro");`);
  await ctx.addInitScript(mock);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:1420/?overlay=1"); await p.waitForTimeout(300);
  await p.evaluate(() => window.__mockEmit("nga://overlay", "tool:games"));
  await p.waitForSelector(".games"); await p.waitForTimeout(300);
  const unlocked = (await p.locator('.game-card.locked:has-text("Igisoro")').count()) === 0;
  console.log(`${unlocked ? "PASS" : "FAIL"} ${theme}: an approved Igisoro is open`);
  await p.click('.game-card:has-text("Igisoro")');
  await p.click('button:has-text("Got it")');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${SHOTS}/igisoro-${theme}-0.png` });
  for (let i = 0; i < 4; i++) { await p.keyboard.press("Enter"); await p.waitForTimeout(2500); }
  await p.screenshot({ path: `${SHOTS}/igisoro-${theme}-1.png` });
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem("mock.state")).stores["tools-u42.json"]["games.save.igisoro"]);
  const seeds = JSON.stringify(st).match(/\d+/g);
  const total = (st?.pits ?? []).flat(2).reduce((a, n) => a + (typeof n === "number" ? n : 0), 0);
  console.log(`${st && st.moves > 0 ? "PASS" : "FAIL"} ${theme}: moves played and saved — moves=${st?.moves}`);
  console.log(`${total === 64 ? "PASS" : "FAIL"} ${theme}: 64 seeds on the board — ${total}`);
  console.log(`${errs.length ? "FAIL" : "PASS"} ${theme}: no page errors ${errs.join("|")}`);
  await ctx.close();
}
await b.close();
