#!/usr/bin/env node
// Fails when a package that ships in NGA Desktop (production dependencies and
// everything they pull in) isn't under a permissive licence. GPL / AGPL /
// CC-BY-SA would oblige us to publish our source or share-alike our data
// (docs/TOOLS_HUB_IMPLEMENTATION_PLAN.md §4.4).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ALLOWED = /^(MIT|ISC|BSD-2-Clause|BSD-3-Clause|0BSD|Apache-2\.0|Unlicense|CC0-1\.0|BlueOak-1\.0\.0|Python-2\.0)$/;
const root = new URL("..", import.meta.url).pathname;
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const bad = [];
let checked = 0;

/** "(MIT OR Apache-2.0)" is fine when any choice is allowed; "A AND B" needs all. */
export function permissive(expr) {
  const e = String(expr ?? "").replace(/[()]/g, " ").trim();
  if (!e) return false;
  return e.split(/\s+OR\s+/).some((alt) => alt.split(/\s+AND\s+/).every((id) => ALLOWED.test(id.trim())));
}

for (const [path, info] of Object.entries(lock.packages ?? {})) {
  if (!path || info.dev || info.devOptional || info.optional && !existsSync(join(root, path))) continue;
  let licence = info.license;
  if (!licence && existsSync(join(root, path, "package.json"))) licence = JSON.parse(readFileSync(join(root, path, "package.json"), "utf8")).license;
  checked++;
  if (!permissive(licence)) bad.push(`${path.replace(/^node_modules\//, "")}: ${licence ?? "no licence"}`);
}

if (bad.length) {
  console.error(`Licences that can't ship in NGA Desktop:\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log(`Licences OK (${checked} shipped packages, all permissive).`);
