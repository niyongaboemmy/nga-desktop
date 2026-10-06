// macOS and Windows file systems ignore case: "notes.ts" and "Notes.tsx" resolve to the
// same import ("./notes/Notes"), which broke the build twice. Keep names distinct.
import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else out.push(p);
  }
  return out;
}

describe("source file names", () => {
  it("no two modules differ only by letter case", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const f of files(join(__dirname))) {
      const key = f.replace(/\.(test\.)?(tsx?|css)$/, "").toLowerCase();
      if (/\.test\./.test(f)) continue;
      const prev = seen.get(key);
      if (prev && prev !== f) clashes.push(`${prev} ↔ ${f}`);
      seen.set(key, f);
    }
    expect(clashes).toEqual([]);
  });
});
