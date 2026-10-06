import { webkit } from "playwright";
import fs from "node:fs";
const SHOTS = new URL("../shots", import.meta.url).pathname;
const FX = new URL("../.fx", import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(FX, { recursive: true });
const mock = fs.readFileSync(new URL("../mock.js", import.meta.url), "utf8");
const b = await webkit.launch();
for (const theme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 360, height: 84 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(`localStorage.setItem("nga.theme", ${JSON.stringify(theme)})`); await ctx.addInitScript(mock);
  const p = await ctx.newPage();
  await p.goto("http://localhost:1420/?tooltip=1");
  await p.waitForTimeout(300);
  await p.evaluate(() => window.__mockEmit("nga://tooltip", { text: "Notifications", hint: "3 unread", keys: "⌘⇧N", arrow: 180 }));
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${SHOTS}/tip-${theme}.png`, omitBackground: true });
  await p.evaluate(() => window.__mockEmit("nga://tooltip", { text: "Settings", hint: null, keys: "⌘,", arrow: 352 }));
  await p.waitForTimeout(250);
  const r = await p.$eval(".tip", (el) => { const a = el.querySelector(".tip-arrow").getBoundingClientRect(); const t = el.getBoundingClientRect(); return { right: t.right, arrowCenter: a.left + a.width / 2 }; });
  // At the window's right edge the bubble stays inside and its arrow still points at the button.
  console.log(`${r.right <= 360 && r.arrowCenter > 300 ? "PASS" : "FAIL"} ${theme}: tooltip at the edge stays on screen, arrow on the button — ${JSON.stringify(r)}`);
  await p.screenshot({ path: `${SHOTS}/tip-${theme}-edge.png`, omitBackground: true });
}
await b.close();
