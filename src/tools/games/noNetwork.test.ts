// Games run offline, always (plan §6.7.1 #6): no game folder may reach the network.
// Only the hub's play-time sync (games/*.ts at this level) talks to NGA MIS.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname);
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });

describe("games stay offline", () => {
  const gameFiles = readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory()).flatMap((d) => files(join(root, d)));
  it("has game files to check", () => expect(gameFiles.length).toBeGreaterThan(10));
  it.each(gameFiles.map((f) => [f.slice(root.length + 1), f]))("%s makes no network calls", (_n, f) => {
    const src = readFileSync(f, "utf8");
    expect(src).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|misCall|tools_api|@tauri-apps\/api\/core|https?:\/\/(?!www\.w3\.org)/);
  });
});
