#!/usr/bin/env node
// node scripts/release-manifest.mjs <folder with the built files>  > release.json
//
// The manifest the NGA update service (NGA MIS backend, routes/desktop.ts)
// serves from /opt/apps/desktop-releases/<version>/release.json:
// - downloads: the installers people download (file, size, sha256);
// - updates:   what installed apps update with, per Tauri updater target
//              ({os}-{arch}), with the package's minisign signature;
// - notes:     this version's CHANGELOG section, shown in the update prompt.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: release-manifest.mjs <dir>");
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const files = readdirSync(dir);
const find = (re) => files.find((f) => re.test(f));
const info = (file) => {
  if (!file) return undefined;
  const buf = readFileSync(join(dir, file));
  return { file, size: statSync(join(dir, file)).size, sha256: createHash("sha256").update(buf).digest("hex") };
};
const signed = (file) => {
  if (!file) return undefined;
  const sig = files.includes(`${file}.sig`) ? readFileSync(join(dir, `${file}.sig`), "utf8").trim() : null;
  if (!sig) throw new Error(`${file}: no .sig (is TAURI_SIGNING_PRIVATE_KEY set?)`);
  return { file, signature: sig };
};

const dmg = find(/\.dmg$/);
const exe = find(/-setup\.exe$/);
const msi = find(/\.msi$/);
const appTar = find(/\.app\.tar\.gz$/);
if (!dmg || !exe) throw new Error(`missing installers in ${dir}: ${files.join(", ")}`);

// This version's CHANGELOG section, as plain text.
function notes() {
  const md = readFileSync("CHANGELOG.md", "utf8");
  const start = md.search(new RegExp(`^## ${version.replace(/\./g, "\\.")}\\b`, "m"));
  if (start < 0) return "";
  const rest = md.slice(start).split("\n").slice(1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return (end < 0 ? rest : rest.slice(0, end))
    .map((l) => l.replace(/^### /, "").replace(/\*\*/g, "").replace(/`/g, ""))
    .join("\n")
    .trim()
    .slice(0, 2000);
}

const mac = signed(appTar);
const win = signed(exe);
const manifest = {
  version,
  pub_date: new Date().toISOString(),
  notes: notes(),
  downloads: { macos: info(dmg), windows: info(exe), "windows-msi": info(msi) },
  // Tauri's {{target}}-{{arch}}; the macOS package is universal (both chips).
  updates: {
    "darwin-aarch64": mac,
    "darwin-x86_64": mac,
    "windows-x86_64": win,
  },
};
process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
