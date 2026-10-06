import { chromium, webkit } from "playwright";
import fs from "node:fs";
const SHOTS = new URL("../shots", import.meta.url).pathname;
const FX = new URL("../.fx", import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(FX, { recursive: true });
const OUT = new URL("../shots/", import.meta.url).pathname;
const mock = fs.readFileSync(new URL("../mock.js", import.meta.url), "utf8");
const engineName = process.argv[2] || "webkit";
const theme = process.argv[3] || "dark";
const engine = engineName === "chromium" ? chromium : webkit;
const results = [], errors = [];
const check = (n, ok, d = "") => results.push(`${ok ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`);
const browser = await engine.launch();

async function overlayPage(persona = "teacher") {
  const ctx = await browser.newContext({ viewport: { width: 1320, height: 840 } });
  await ctx.addInitScript(`localStorage.setItem("nga.theme", ${JSON.stringify(theme)}); localStorage.setItem("mock.persona", ${JSON.stringify(persona)});`);
  await ctx.addInitScript(mock);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  await p.goto("http://localhost:1420/?overlay=1");
  await p.waitForTimeout(300);
  return p;
}
const shot = (p, n) => p.screenshot({ path: `${OUT}modal-${engineName}-${theme}-${n}.png` });

const p = await overlayPage();
await p.evaluate(() => window.__mockEmit("nga://overlay", "tools"));
await p.waitForSelector(".tools-modal .tool-tile");
await p.waitForTimeout(400);
check("launcher lists the tools", (await p.locator(".tool-tile").count()) >= 20, String(await p.locator(".tool-tile").count()));
check("modal is centred", await p.$eval(".tools-modal", (m) => { const r = m.getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - innerWidth / 2) < 2 && Math.abs(r.top + r.height / 2 - innerHeight / 2) < 2; }));
check("search has focus", await p.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Search tools…"));
await shot(p, "01-launcher");

await p.keyboard.type("calc");
await p.keyboard.press("Enter");
await p.waitForSelector(".modal-tool:not([hidden]) .calc");
await p.waitForTimeout(300);
check("Enter opens the first match in the modal", (await p.locator(".modal-title strong").textContent()) === "Calculator");
check("calculator modal is narrow (s)", await p.$eval(".tools-modal", (m) => m.getBoundingClientRect().width <= 470));
await p.fill(".calc-input", "6*7");
await p.press(".calc-input", "Enter");
check("calculator works in the modal", (await p.locator(".calc-answer").textContent()).trim().startsWith("42"));
await shot(p, "02-calculator");
await p.press(".calc-input", "Escape");
check("first Esc clears the calculator, modal stays", (await p.locator(".modal-layer").getAttribute("hidden")) === null && (await p.locator(".calc-answer").count()) === 0);
await p.keyboard.press("Escape");
await p.waitForTimeout(150);
check("second Esc closes the modal", (await p.locator(".modal-layer").getAttribute("hidden")) !== null);
await p.evaluate(() => window.__mockEmit("nga://overlay", "tool:calculator"));
await p.waitForTimeout(200);
await p.click('button[aria-label="History"]');
check("tool state survives closing the modal", (await p.locator(".calc-history li").count()) === 1);

// back to launcher, keyboard arrows
await p.click('.modal-head button[aria-label="All tools"]');
await p.waitForSelector(".launcher");
await p.keyboard.press("ArrowRight");
check("arrow keys move the selection", (await p.locator(".tool-tile.sel .tool-name").textContent()).length > 0);

// Focus: stepper + primary button hover colour
await p.click('.tool-tile-main:has-text("Focus timer")');
await p.waitForSelector(".focus .stepper");
await p.click('.stepper button[aria-label="Work (min) +"]');
check("stepper + works", (await p.inputValue('.stepper input[aria-label="Work (min)"]')) === "30");
await p.hover(".focus-start");
await p.waitForTimeout(300);
const bg = await p.$eval(".focus-start", (e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color]);
check("primary button stays filled on hover", !/rgb\(1[0-9], 2[0-9]|rgb\(2[0-9], 2[0-9]/.test(bg[0]) && bg[1] === "rgb(255, 255, 255)", bg.join(" / "));
await shot(p, "03-focus-hover");

// Ask AI
await p.click('.modal-head button[aria-label="All tools"]');
await p.click('.tool-tile-main:has-text("Ask AI")');
await p.waitForSelector(".ai-hello");
await p.waitForTimeout(300);
check("AI modal is large (l)", await p.$eval(".tools-modal", (m) => m.getBoundingClientRect().width > 850));
check("AI shows remaining messages", (await p.locator(".ai-foot").textContent()).includes("37 of 40"));
await shot(p, "04-ai-hello");
await p.click('.ai-notice button');
await p.click(".ai-suggest button >> nth=0");
await p.waitForSelector(".ai-msg.bot.streaming");
await p.waitForTimeout(450);
await shot(p, "05-ai-streaming");
await p.waitForSelector(".ai-msg.bot:not(.streaming) .ai-tools");
check("answer rendered as Markdown + maths + table", (await p.locator(".ai-md strong").count()) > 0 && (await p.locator(".ai-md .katex").count()) > 0 && (await p.locator(".ai-md table").count()) === 1);
check("answered-by label", (await p.locator(".ai-tools .muted").textContent()).includes("Groq"));
check("remaining updated", (await p.locator(".ai-foot").textContent()).includes("36 of 40"));
await p.fill(".ai-composer textarea", "Make it shorter");
await p.keyboard.press("Enter");
await p.waitForTimeout(1500);
check("follow-up question works", (await p.locator(".ai-msg.user").count()) === 2 && (await p.locator(".ai-msg.bot").count()) === 2);
await shot(p, "06-ai-chat");

// Student
const s = await overlayPage("student");
await s.evaluate(() => window.__mockEmit("nga://overlay", "tool:ai"));
await s.waitForSelector(".ai-empty");
check("students meet the AI Tutor first", (await s.locator(".ai-empty strong").textContent()).includes("AI Tutor"));
await s.screenshot({ path: `${OUT}modal-${engineName}-${theme}-07-ai-student.png` });

// Converter + dates in the modal
await p.click('.modal-head button[aria-label="All tools"]');
await p.click('.tool-tile-main:has-text("Date calculator")');
await p.waitForSelector(".dates");
await p.click('.segmented-sm button:has-text("Add days")');
await p.waitForTimeout(200);
await shot(p, "08-dates");

console.log(results.join("\n"));
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no page errors");
await browser.close();
