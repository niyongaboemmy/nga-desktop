import { webkit } from "playwright";
import fs from "node:fs";
const SHOTS = new URL("../shots", import.meta.url).pathname;
const FX = new URL("../.fx", import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(FX, { recursive: true });
const mock = fs.readFileSync(new URL("../mock.js", import.meta.url), "utf8");
const theme = process.argv[2] || "dark";
const b = await webkit.launch();
const r = (n, c, d = "") => console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`);
const errs = [];
async function page(persona, policy, tool) {
  const ctx = await b.newContext({ viewport: { width: 1320, height: 840 } });
  await ctx.addInitScript(`localStorage.setItem("nga.theme", ${JSON.stringify(theme)}); localStorage.setItem("mock.persona", ${JSON.stringify(persona)}); localStorage.setItem("mock.policy", ${JSON.stringify(policy)});`);
  await ctx.addInitScript(mock);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:1420/?overlay=1"); await p.waitForTimeout(300);
  await p.evaluate((t) => window.__mockEmit("nga://overlay", `tool:${t}`), tool); await p.waitForTimeout(700);
  return p;
}
// Teacher: class game time tool.
let p = await page("teacher", "open", "class-game-time");
await p.waitForSelector(".cgt select");
r("classes listed", (await p.locator(".cgt select option").count()) === 2);
await p.click('.cgt-game:has-text("Mines")');
await p.click('.cgt .segmented-sm button:has-text("15 min")');
await p.click('.cgt .btn.primary');
await p.waitForSelector(".cgt-live li", { timeout: 4000 });
const post = await p.evaluate(() => window.__cgtPosts?.[0]);
r("start sends class, games, minutes", post && post.classGroupId === 7 && post.minutes === 15 && post.games.includes("mines") && post.games.includes("math-sprint"), JSON.stringify(post));
r("running shows countdown", /1[45]:\d\d left/.test(await p.locator(".cgt-left").textContent()), await p.locator(".cgt-left").textContent());
await p.screenshot({ path: `${SHOTS}/cgt-${theme}.png` });
await p.click('.cgt-live button:has-text("End now")'); await p.waitForTimeout(400);
r("ended", (await p.locator(".cgt-live li").count()) === 0);
await p.context().close();
// Student in a lesson with class game time.
p = await page("student", "classtime", "games");
await p.waitForSelector(".games");
r("class time banner", (await p.locator(".games-banner.class-time").textContent()).includes("Mr Habimana opened 2 games"));
r("mines open in the lesson", (await p.locator('.game-card:not(.locked):has-text("Mines")').count()) === 1);
r("other games locked by the lesson", (await p.locator('.game-card.locked:has-text("Snake")').count()) === 1);
await shot();
async function shot() { await p.screenshot({ path: `${SHOTS}/classtime-${theme}.png` }); }
await p.click('.game-card:has-text("Mines")'); await p.click('button:has-text("Got it")');
await p.mouse.move(500, 400); await p.waitForTimeout(2300);
const u = await p.evaluate(() => JSON.parse(localStorage.getItem("mock.state")).stores["tools-u42.json"]["games.usage"]);
r("class time not counted", !u || Object.keys(u.days).length === 0 || !Object.values(u.days).some((d) => d.mines), JSON.stringify(u));
await p.context().close();
// Blocked student.
p = await page("student", "blocked", "games");
await p.waitForSelector(".games");
r("blocked banner", (await p.locator(".games-banner").first().textContent()).includes("paused games for you until"));
r("resets still open when blocked", (await p.locator('.games-grid.reset .game-card.locked').count()) === 0);
await p.context().close();
// Typing tutor.
p = await page("student", "open", "games");
await p.click('.game-card:has-text("Typing Tutor")'); await p.click('button:has-text("Got it")');
await p.waitForSelector(".tpg-text");
const target = await p.evaluate(() => JSON.parse(localStorage.getItem("mock.state")).stores["tools-u42.json"]["games.save.typing"].target);
r("first lesson uses home-row keys", /^[asdfjkl ]+$/.test(target), target);
const next0 = await p.locator(".tpg-key.next").textContent();
r("next key highlighted", next0.toLowerCase() === target[0], next0);
await p.keyboard.type(target.slice(0, 12), { delay: 15 });
await p.keyboard.type("q"); // a mistake
await p.waitForTimeout(1200);
r("mistake shown", (await p.locator(".tpg-text .bad").count()) === 1);
await p.keyboard.press("Backspace");
await p.keyboard.type(target.slice(12), { delay: 5 });
await p.waitForTimeout(400);
const done = await p.locator(".tpg-done").textContent().catch(() => "");
r("lesson passed", done.includes("Passed"), done);
await p.screenshot({ path: `${SHOTS}/typing-${theme}.png` });
await p.click('.tpg-done button:has-text("Next lesson")');
r("next lesson adds G and H", (await p.locator(".tpg-bar select").inputValue()) === "1");
await p.click('.tpg-bar .segmented-sm button:has-text("Speed test")');
await p.selectOption('.tpg-bar select', "fr"); await p.waitForTimeout(200);
r("French test uses AZERTY", (await p.locator(".tpg-row.r1").textContent()).startsWith("azerty"));
await p.screenshot({ path: `${SHOTS}/typing-test-${theme}.png` });
await p.context().close();
r("no page errors", errs.length === 0, errs.join(" | "));
await b.close();
