// Brain breaks hub: locks, shell, play-time counting and sync, reset activities, 2048.
import { webkit } from "playwright";
import fs from "node:fs";
const SHOTS = new URL("../shots", import.meta.url).pathname;
const FX = new URL("../.fx", import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(FX, { recursive: true });
const mock = fs.readFileSync(new URL("../mock.js", import.meta.url), "utf8");
const theme = process.argv[2] || "dark";
const b = await webkit.launch();
const r = []; const ok = (n, c, d = "") => r.push(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`);
const errs = [];

async function page(persona, policy, extra = "") {
  const ctx = await b.newContext({ viewport: { width: 1320, height: 840 } });
  await ctx.addInitScript(`localStorage.setItem("nga.theme", ${JSON.stringify(theme)}); localStorage.setItem("mock.persona", ${JSON.stringify(persona)}); localStorage.setItem("mock.policy", ${JSON.stringify(policy)}); ${extra}`);
  await ctx.addInitScript(mock);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(`${persona}/${policy}: ${e.message}`));
  await p.goto("http://localhost:1420/?overlay=1"); await p.waitForTimeout(300);
  await p.evaluate(() => window.__mockEmit("nga://overlay", "tool:games"));
  await p.waitForSelector(".games", { timeout: 5000 });
  await p.waitForTimeout(400);
  return p;
}
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/games-${theme}-${n}.png` });

// 1. Open hub, student, nothing locked.
let p = await page("student", "open");
ok("hub lists 18 games", (await p.locator(".game-card").count()) === 18);
ok("budget line", (await p.locator(".games-today").textContent()).includes("of 30 min"), await p.locator(".games-today").textContent());
ok("igisoro locked (not approved)", (await p.locator('.game-card.locked:has-text("Igisoro")').count()) === 1);
ok("no global banner", (await p.locator(".games-banner").count()) === 0);
await shot(p, "01-hub");
await p.click('.game-card:has-text("Igisoro")');
ok("locked game explains itself", (await p.locator(".games-banner").textContent()).includes("approves"));
// Open 2048: rules first time.
await p.click('.game-card:has-text("Merge to 2048")');
await p.waitForSelector(".game-veil-card.help");
ok("rules shown on first open", true);
await shot(p, "02-rules");
await p.click('button:has-text("Got it")');
await p.waitForSelector(".m2048-board");
const before = await p.locator(".m2048-cell.v").count();
ok("2048 starts with two tiles", before === 2);
for (const k of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) await p.keyboard.press(k);
await p.waitForTimeout(100);
ok("tiles appear as you play", (await p.locator(".m2048-cell.v").count()) > 2);
const board1 = await p.locator(".m2048-board").textContent();
// Count play time: the page must be "focused" and recently used.
await p.mouse.move(400, 400); await p.waitForTimeout(3300);
const usage = await p.evaluate(() => JSON.parse(localStorage.getItem("mock.state")).stores["tools-u42.json"]["games.usage"]);
const today = Object.values(usage.days).at(-1);
ok("play time counted", (today["merge-2048"] ?? 0) >= 2, JSON.stringify(usage));
ok("session counted for a student", usage.session.sec >= 2);
ok("session chip shown", (await p.locator(".game-left").count()) === 1, await p.locator(".game-left").textContent().catch(() => ""));
await shot(p, "03-2048");
// Leave and come back: same board; usage synced on leaving.
await p.click('.game-bar .icon-btn[aria-label="All games"]');
await p.waitForTimeout(300);
const posts = await p.evaluate(() => window.__usagePosts || []);
ok("leaving syncs play time", posts.length >= 1 && posts.at(-1).entries.some((e) => e.game === "merge-2048") && /^[a-z0-9]{8,16}$/.test(posts.at(-1).device), JSON.stringify(posts.at(-1)));
await p.click('.game-card:has-text("Merge to 2048")');
await p.waitForSelector(".m2048-board");
ok("game restored exactly", (await p.locator(".m2048-board").textContent()) === board1);
ok("rules not shown twice", (await p.locator(".game-veil-card.help").count()) === 0);
// New game resets.
await p.click('button:has-text("New game")');
await p.waitForTimeout(100);
ok("new game: two tiles", (await p.locator(".m2048-cell.v").count()) === 2);
await p.click('.game-bar .icon-btn[aria-label="All games"]');
// Breathe.
await p.click('.game-card:has-text("Breathe")');
await p.click('button:has-text("Got it")');
await p.click('.brz button:has-text("Start")');
await p.waitForTimeout(1300);
ok("breathe guides", (await p.locator(".brz-word strong").textContent()) === "Breathe in");
await shot(p, "04-breathe");
await p.click('.game-bar .icon-btn[aria-label="All games"]');
// Stretch.
await p.click('.game-card:has-text("Stand & Stretch")');
await p.click('button:has-text("Got it")');
await p.click('.stretch-pick button:has-text("Stand tall")');
await p.waitForTimeout(1200);
ok("stretch runs", (await p.locator(".stretch-text strong").textContent()).startsWith("Stand up"));
await p.click('.stretch-controls .icon-btn[aria-label="Next move"]');
ok("stretch skips", (await p.locator(".stretch-text .muted").textContent()).includes("2 of 5"));
await shot(p, "05-stretch");
await p.context().close();

// 2. Lesson lock for a student: banner; reset still open.
p = await page("student", "lesson");
ok("lesson banner", (await p.locator(".games-banner.lesson").textContent()).includes("Physics S4"));
ok("fun games locked in a lesson", (await p.locator(".game-card.locked").count()) === 16);
ok("resets open in a lesson", (await p.locator('.games-grid.reset .game-card.locked').count()) === 0);
await shot(p, "06-lesson");
await p.context().close();

// 3. Exam + budget + quiet + off.
for (const [mode, text] of [["exam", "Maths CAT"], ["budget", "played 30 min"], ["quiet", "rest at night"], ["off", "switched games off"]]) {
  p = await page("student", mode);
  const t = await p.locator(".games-banner").first().textContent().catch(() => "");
  ok(`${mode} lock`, t.includes(text), t);
  await p.context().close();
}

// 4. Teacher: no budget, no session chip; not locked by a lesson they attend... (mock gives them a teaching lesson)
p = await page("teacher", "open");
ok("teacher: no daily limit", (await p.locator(".games-today").textContent()).includes("no daily limit"));
await p.context().close();

// 5. Session cap: 1 minute cap, play past it -> session over veil.
p = await page("student", "open", `localStorage.setItem("mock.cap", "0.05");`);
await p.click('.game-card:has-text("Merge to 2048")');
await p.click('button:has-text("Got it")');
await p.mouse.move(300, 300);
for (let i = 0; i < 6; i++) { await p.waitForTimeout(1000); await p.mouse.move(300 + i, 300); }
const veil = await p.locator(".game-veil-card").textContent().catch(() => "");
ok("session cap -> stretch prompt, game saved", veil.includes("Session over") && veil.includes("saved"), veil);
await shot(p, "07-session-over");
await p.click('.game-veil-card button:has-text("Stand & Stretch")');
await p.waitForTimeout(300);
ok("stretch opens from the prompt", (await p.locator(".stretch").count()) === 1);
await p.context().close();

ok("no page errors", errs.length === 0, errs.join(" | "));
console.log(r.join("\n"));
await b.close();
