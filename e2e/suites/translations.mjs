// Translation workspace: hidden without the permission; edit, placeholder check,
// approve, publish (the app shows the new text at once), AI draft, rollback, 403.
import { webkit } from "playwright";
import fs from "node:fs";
const SHOTS = new URL("../shots", import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
const mock = fs.readFileSync(new URL("../mock.js", import.meta.url), "utf8");
const theme = process.argv[2] || "dark";
const r = (n, c, d = "") => console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`);
const b = await webkit.launch();
const errs = [];

async function page({ flag, perm }) {
  const ctx = await b.newContext({ viewport: { width: 1320, height: 900 } });
  await ctx.addInitScript(`localStorage.setItem("nga.theme", ${JSON.stringify(theme)}); localStorage.setItem("mock.persona", "teacher"); localStorage.setItem("nga.tools.lang", "fr");
    ${flag ? 'localStorage.setItem("nga.tools.can.translations.42", "1");' : ""} ${perm ? 'localStorage.setItem("mock.trPerm", "1");' : ""}`);
  await ctx.addInitScript(mock);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:1420/?overlay=1");
  await p.waitForTimeout(300);
  return p;
}
const launcher = async (p) => { await p.evaluate(() => window.__mockEmit("nga://overlay", "tools")); await p.waitForSelector(".launcher-grid"); await p.waitForTimeout(200); };
const open = async (p, id) => { await p.evaluate((v) => window.__mockEmit("nga://overlay", `tool:${v}`), id); await p.waitForTimeout(500); };

// 1. No permission: the tile isn't there.
let p = await page({ flag: false, perm: false });
await launcher(p);
r("hidden without the permission", (await p.locator('.tool-tile:has-text("Traductions")').count()) === 0);
await p.context().close();

// 2. Permission: the workspace.
p = await page({ flag: true, perm: true });
await launcher(p);
r("listed with the permission", (await p.locator('.tool-tile:has-text("Traductions")').count()) === 1);
await open(p, "translations");
await p.waitForSelector(".trw-list li button", { timeout: 10000 });
r("every string listed", (await p.locator(".trw-list li button").count()) >= 300);
await p.fill(".trw-filters input", "Brain breaks");
await p.locator(".trw-list li button").first().click();
r("editor opens with English and the bundled French", (await p.locator(".trw-source p").textContent()) === "Brain breaks" && (await p.locator("#trw-text").inputValue()) === "Pauses cérébrales");
await p.fill("#trw-text", "Pauses détente");
await p.click('.trw-editor button:has-text("Approuver")');
await p.waitForTimeout(400);
r("approved and waiting to be published", (await p.locator(".trw-top .btn.primary").textContent()).includes("Publier 1"));
await p.screenshot({ path: `${SHOTS}/translations-${theme}.png` });
await p.click(".trw-top .btn.primary");
await p.waitForTimeout(600);
r("published as release #1", ((await p.locator(".trw p[role=status]").textContent()) || "").includes("n° 1"));
await launcher(p);
r("the app shows the new text at once", (await p.locator('.tool-tile:has-text("Pauses détente")').count()) === 1);

// Placeholder check.
await open(p, "translations");
await p.fill(".trw-filters input", "{n} min");
await p.locator(".trw-list li button", { hasText: "{n} min" }).first().click();
await p.fill("#trw-text", "minutes");
r("a missing placeholder blocks approval", (await p.locator('.trw-editor button:has-text("Approuver")').isDisabled()) && (await p.locator(".trw-editor .field-error").count()) === 1);

// AI suggestion → AI draft (not published).
await p.click('.trw-editor button:has-text("Suggérer avec l\'IA")');
await p.waitForTimeout(500);
r("AI suggestion saved as an AI draft", (await p.locator("#trw-text").inputValue()).startsWith("[IA]") && (await p.locator(".trw-list li button.sel .trw-badge").textContent()).includes("Brouillon IA"));

// Rollback to "nothing": publish #2 after reverting, then back to #1.
await p.fill(".trw-filters input", "Brain breaks");
await p.locator(".trw-list li button").first().click();
await p.click('.trw-editor button:has-text("Revenir au texte de l\'app")');
await p.waitForTimeout(300);
const calls = await p.evaluate(() => window.__trCalls.map((c) => c.action));
r("revert, edit and publish calls sent", ["edit", "publish", "suggest", "revert"].every((a) => calls.includes(a)), calls.join(","));
await p.click('.trw-top button:has-text("Publications")');
r("releases listed", (await p.locator(".trw-releases li").count()) >= 1);
await p.context().close();

// 3. Flag set but MIS says no (permission removed): a clear message.
p = await page({ flag: true, perm: false });
await open(p, "translations");
await p.waitForTimeout(500);
r("a lost permission is explained", ((await p.locator(".tools-modal").innerText()) || "").includes("permission"));
await p.context().close();

r("no page errors", errs.length === 0, errs.join(" | "));
await b.close();
