// Shell (Phase A): Settings switches for auto-update and start-with-computer,
// the notification inbox's snooze, and the language reaching the native side.
import { chromium } from "playwright";
import fs from "node:fs";
const OUT = new URL("../shots/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const mock = fs.readFileSync(new URL("../mock.js", import.meta.url), "utf8");
const results = [], errors = [];
const check = (n, ok, d = "") => results.push(`${ok ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`);
const browser = await chromium.launch();

async function shell(init = "") {
  const ctx = await browser.newContext({ viewport: { width: 1320, height: 840 } });
  await ctx.addInitScript(`localStorage.setItem("nga.theme", "light"); localStorage.setItem("mock.updater", "1"); ${init}`);
  await ctx.addInitScript(mock);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await p.goto("http://localhost:1420/");
  await p.waitForTimeout(600);
  return p;
}
const invokes = (p, cmd) => p.evaluate((c) => (window.__invokes || []).filter((i) => i.cmd === c).map((i) => i.args), cmd);
const switchFor = (p, text) => p.locator(`label.switch-row:has(strong:text-is("${text}")) input.switch`);

// ── Settings: automatic updates + start with the computer ────────────────────
const p = await shell(`localStorage.setItem("mock.autostart", "0");`);
await p.evaluate(() => window.__mockEmit("nga://menu", "settings"));
await p.waitForSelector(".settings");
const auto = switchFor(p, "Install updates automatically");
const start = switchFor(p, "Start NGA when this computer starts");
check("auto-update switch shows, on by default", (await auto.count()) === 1 && (await auto.isChecked()));
check("start-with-computer switch shows the saved state (off)", (await start.count()) === 1 && !(await start.isChecked()));
await start.click();
await auto.click();
await p.waitForTimeout(150);
check("turning start-with-computer on asks the native side", JSON.stringify(await invokes(p, "autostart_set")) === JSON.stringify([{ on: true }]));
check("turning auto-update off is saved", JSON.stringify(await invokes(p, "update_auto_set")) === JSON.stringify([{ on: false }]) && !(await auto.isChecked()));
const wipe = switchFor(p, "Remove my tool data when I sign out");
check("shared-computer wipe switch, off by default", (await wipe.count()) === 1 && !(await wipe.isChecked()));
await wipe.click();
await p.waitForTimeout(150);
check("turning it on saves wipeOnSignOut", await p.evaluate(() => JSON.parse(localStorage.getItem("mock.state")).stores["settings.json"]?.wipeOnSignOut === true));
await p.locator(".settings").screenshot({ path: `${OUT}shell-settings.png` });

// Language: the picker lives in General now and tells the native menus.
const langSelect = p.locator('label.switch-row:has(strong:text-is("Language")) select');
check("language picker is in Settings", (await langSelect.count()) === 1);
check("shell language reported to the native side at start", (await invokes(p, "shell_set_lang")).some((a) => a.lang === "en"));
const sel = await langSelect.elementHandle();
await sel.selectOption("fr");
await p.waitForTimeout(250);
check("switching to French re-labels Settings", (await switchFor(p, "Installer les mises à jour automatiquement").count()) === 1 || (await p.locator(".settings").textContent()).includes("automatiquement"));
check("…and tells the native menus", (await invokes(p, "shell_set_lang")).some((a) => a.lang === "fr"));
check("…and the title bar follows in the same window", (await p.locator("header.titlebar").textContent()).includes("Rechercher") || (await p.locator("header.titlebar").innerHTML()).includes("Rechercher"));
await sel.selectOption("en");

// ── Inbox: snooze ─────────────────────────────────────────────────────────────
const notices = [
  { id: 7, app: "tupo", title: "Staff meeting moved", body: "Now at 15:00 in the Academy Hall.", at: Date.now() - 120000, read: false },
  { id: 6, app: "mis", title: "Marks due Friday", body: "", at: Date.now() - 3600000, read: true },
];
const q = await shell(`localStorage.setItem("mock.notices", ${JSON.stringify(JSON.stringify(notices))});`);
await q.click("button.bell");
await q.waitForSelector(".notice-list li");
check("inbox lists stored notices (they survive a restart natively)", (await q.locator(".notice-list li").count()) === 2);
check("unread notice is marked", (await q.locator(".notice.unread").count()) === 1);
await q.locator(".notice-row").first().hover();
await q.locator(".notice-row").first().locator(".notice-snooze").click();
check("snooze offers 10 min / 1 h / 3 h", (await q.locator(".snooze-menu .chip").allTextContents()).join("|") === "10 min|1 h|3 h");
await q.screenshot({ path: `${OUT}shell-snooze.png` });
await q.locator(".snooze-menu .chip", { hasText: "1 h" }).click();
await q.waitForTimeout(200);
check("snoozing asks for 60 minutes on that notice", JSON.stringify(await invokes(q, "notices_snooze")) === JSON.stringify([{ id: 7, minutes: 60 }]));
check("the snoozed notice goes quiet", (await q.locator(".notice.unread").count()) === 0 && (await q.locator(".snooze-menu").count()) === 0);

console.log(results.join("\n"));
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no page errors");
await browser.close();
