#!/usr/bin/env node
// npm run release -- 1.2.0
// Sets the version in package.json (tauri.conf.json reads it from there),
// src-tauri/Cargo.toml and Cargo.lock (CI builds with --locked), adds a
// CHANGELOG heading, commits and tags v1.2.0. Push with:
//   git push origin main --follow-tags
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version ?? "")) {
  console.error("usage: npm run release -- <semver>   e.g. 1.2.0");
  process.exit(1);
}
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (git("status", "--porcelain")) {
  console.error("Commit or stash your changes first.");
  process.exit(1);
}

const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, "utf8")));
edit("package.json", (s) => s.replace(/"version": "[^"]+"/, `"version": "${version}"`));
edit("package-lock.json", (s) => s.replace(/("name": "nga-desktop",\s*"version": )"[^"]+"/g, `$1"${version}"`));
edit("src-tauri/Cargo.toml", (s) => s.replace(/^version = "[^"]+"/m, `version = "${version}"`));
edit("src-tauri/Cargo.lock", (s) => s.replace(/(name = "nga-desktop"\nversion = )"[^"]+"/, `$1"${version}"`));
edit("CHANGELOG.md", (s) =>
  s.replace("## Unreleased", `## Unreleased\n\n## ${version} — ${new Date().toISOString().slice(0, 10)}`),
);

git("add", "package.json", "package-lock.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock", "CHANGELOG.md");
git("commit", "-m", `release: v${version}`);
git("tag", "-a", `v${version}`, "-m", `NGA Desktop v${version}`);
console.log(`Tagged v${version}. Now: git push origin main --follow-tags`);
