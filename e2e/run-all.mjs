// Runs every UI suite against the Vite dev server with faked Tauri internals
// (e2e/mock.js) and prints one summary. Starts `vite` itself when port 1420 is free.
//   npm run e2e                 all suites
//   npm run e2e -- games pdf    only those
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const only = process.argv.slice(2);
// Suites that take a theme argument run in both themes.
const THEMED = new Set(["games", "controls", "pdf", "scan", "ocr"]);

const up = () => fetch("http://localhost:1420/").then((r) => r.ok).catch(() => false);
let vite = null;
if (!(await up())) {
  vite = spawn("npx", ["vite", "--port", "1420", "--strictPort"], { cwd: root, stdio: "ignore" });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
  // Warm-up: the first page load makes Vite optimise dependencies (and reload).
  await fetch("http://localhost:1420/?overlay=1").catch(() => undefined);
  await new Promise((r) => setTimeout(r, 4000));
}

const run = (file, args) => new Promise((resolve) => {
  const child = spawn("node", [file, ...args], { cwd: root });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  child.on("close", (code) => resolve({ code, out }));
});

await run("e2e/fixtures.mjs", []);
const suites = readdirSync(new URL("./suites", import.meta.url)).map((f) => f.replace(/\.mjs$/, "")).filter((s) => !only.length || only.includes(s)).sort();
let pass = 0, fail = 0;
const failures = [];
for (const s of suites) {
  for (const theme of THEMED.has(s) ? ["dark", "light"] : [null]) {
    const { code, out } = await run(`e2e/suites/${s}.mjs`, theme ? [theme] : []);
    const p = (out.match(/^PASS/gm) ?? []).length, f = (out.match(/^FAIL/gm) ?? []).length;
    pass += p; fail += f;
    const label = theme ? `${s} (${theme})` : s;
    if (f || code) failures.push(`${label}:\n${out.split("\n").filter((l) => l.startsWith("FAIL") || /Error|Timeout/.test(l)).slice(0, 8).join("\n")}`);
    console.log(`${f || code ? "✗" : "✓"} ${label.padEnd(22)} ${p} passed${f ? `, ${f} failed` : ""}${code && !f ? ` (exit ${code})` : ""}`);
  }
}
vite?.kill();
console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) console.log(`\n${failures.join("\n\n")}`);
process.exit(failures.length ? 1 : 0);
