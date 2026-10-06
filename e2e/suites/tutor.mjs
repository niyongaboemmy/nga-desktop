// Student AI Tutor: welcome notice first, student prompts, a checked reply with
// maths, report this answer, the lesson pause; teachers keep the assistant.
import { webkit } from "playwright";
import fs from "node:fs";
const SHOTS = new URL("../shots", import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
const mock = fs.readFileSync(new URL("../mock.js", import.meta.url), "utf8");
const theme = process.argv[2] || "dark";
const r = (n, c, d = "") => console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`);
const b = await webkit.launch();
const errs = [];
async function page(persona, policy = "open") {
  const ctx = await b.newContext({ viewport: { width: 1320, height: 900 } });
  await ctx.addInitScript(`localStorage.setItem("nga.theme", ${JSON.stringify(theme)}); localStorage.setItem("mock.persona", ${JSON.stringify(persona)}); localStorage.setItem("mock.policy", ${JSON.stringify(policy)});`);
  await ctx.addInitScript(mock);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:1420/?overlay=1");
  await p.waitForTimeout(300);
  await p.evaluate(() => window.__mockEmit("nga://overlay", "tool:ai"));
  await p.waitForTimeout(600);
  return p;
}

let p = await page("student");
r("students first read how the tutor works", ((await p.locator(".ai-empty").innerText()) || "").includes("won't do your homework"));
await p.click('.ai-empty button:has-text("I understand")');
await p.waitForSelector(".ai-hello");
r("student starter prompts", (await p.locator(".ai-suggest button").first().textContent()) === "Explain photosynthesis simply");
r("tutor footer", (await p.locator(".ai-foot").innerText()).includes("hints, not answers"));
await p.fill(".ai-composer textarea", "How do I solve 3x + 5 = 20?");
await p.keyboard.press("Enter");
await p.waitForSelector(".ai-msg.bot:not(.streaming) .ai-md", { timeout: 5000 });
const body = await p.evaluate(() => window.__tutorBodies[0]);
r("sends a conversation id with the question", /^[a-z0-9]{6,40}$/.test(body.conversationId) && body.messages.at(-1).content.includes("3x"), body.conversationId);
r("maths in \\( \\) renders", (await p.locator(".ai-md .katex").count()) >= 1);
r("remaining questions updated", (await p.locator(".ai-foot").innerText()).includes("13"));
await p.click('.ai-tools button[aria-label="Report this answer"]');
await p.click('.ai-report button:has-text("It gave the answer")');
await p.waitForTimeout(200);
const rep = await p.evaluate(() => window.__reports?.[0]);
r("report sends the logged message id and reason", rep && rep.messageId === 77 && rep.reason === "answer", JSON.stringify(rep));
r("reported state shown", (await p.locator(".ai-tools").innerText()).includes("Reported"));
await p.screenshot({ path: `${SHOTS}/tutor-${theme}.png` });
await p.context().close();

p = await page("student", "lesson");
await p.click('.ai-empty button:has-text("I understand")');
await p.fill(".ai-composer textarea", "help");
await p.keyboard.press("Enter");
await p.waitForSelector(".ai-error", { timeout: 5000 });
r("pauses during the student's lesson, saying until when", (await p.locator(".ai-error").innerText()).includes("pauses during Physics S4. Back at"));
await p.context().close();

p = await page("teacher");
r("teachers keep the assistant (no tutor notice)", (await p.locator(".ai-hello").count()) === 1 && !((await p.locator(".ai-foot").innerText()).includes("hints, not answers")));
await p.context().close();
r("no page errors", errs.length === 0, errs.join(" | "));
await b.close();
