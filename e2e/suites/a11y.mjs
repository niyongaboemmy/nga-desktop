// Accessibility audit (plan 8.1): every tool, both themes, axe-core WCAG 2.1 A/AA.
// Serious and critical violations fail; moderate ones are listed for follow-up.
import { webkit } from "playwright";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const mock = fs.readFileSync(new URL("../mock.js", import.meta.url), "utf8");
const theme = process.argv[2] || "dark";
const only = process.argv.slice(3);
// Tool ids, read from the registry source (keeps this list in step automatically).
const ids = [...fs.readFileSync(new URL("../../src/tools/registry.ts", import.meta.url), "utf8").matchAll(/^\s+id: "([a-z0-9-]+)"/gm)].map((m) => m[1]).filter((id) => !only.length || only.includes(id));

const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 1320, height: 900 } });
await ctx.addInitScript(`localStorage.setItem("nga.theme", ${JSON.stringify(theme)}); localStorage.setItem("mock.persona", "teacher"); localStorage.setItem("mock.policy", "open"); localStorage.setItem("nga.tools.can.translations.42", "1"); localStorage.setItem("mock.trPerm", "1");`);
await ctx.addInitScript(mock);
const p = await ctx.newPage();
await p.goto("http://localhost:1420/?overlay=1");
await p.waitForTimeout(400);
await p.addScriptTag({ content: AXE });

const audit = async (name) => {
  const res = await p.evaluate(async () => {
    const r = await window.axe.run(document.querySelector(".tools-modal") || document.body, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0]?.target?.join(" ") ?? "", why: v.nodes[0]?.failureSummary?.split("\n")[1]?.trim() ?? "" }));
  });
  const bad = res.filter((v) => v.impact === "serious" || v.impact === "critical");
  const minor = res.filter((v) => !bad.includes(v));
  console.log(`${bad.length ? "FAIL" : "PASS"} ${theme} ${name}${bad.length ? " — " + bad.map((v) => `${v.id}×${v.n} [${v.sample}] ${v.why}`).join(" | ") : ""}${minor.length ? `   (minor: ${minor.map((v) => `${v.id}×${v.n}`).join(", ")})` : ""}`);
};

await p.evaluate(() => window.__mockEmit("nga://overlay", "tools"));
await p.waitForSelector(".launcher-grid");
await p.waitForTimeout(300);
if (!only.length) await audit("launcher");
for (const id of ids) {
  await p.evaluate((v) => window.__mockEmit("nga://overlay", `tool:${v}`), id);
  await p.waitForTimeout(900);
  // Dismiss first-time rules in games so the game itself is audited.
  await audit(id);
}
await b.close();
