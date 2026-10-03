import { describe, expect, it } from "vitest";
import { addRecent, buildItems, score, search } from "./palette";
import { resolveTheme } from "./theme";
import type { DesktopApp } from "./native";

const app = (key: DesktopApp["key"], name: string, destinations: DesktopApp["destinations"] = []): DesktopApp => ({
  key, name, description: "", origin: `https://${key}.amashuri.com`, base: "", startPath: "/", color: "#000", sso: null, destinations,
});
const apps = [
  app("mis", "NGA MIS", [{ label: "Lesson notes", path: "/lesson-notes", keywords: "notes teaching" }]),
  app("tendo", "Tendo", [{ label: "Take attendance", path: "/attendance/mark", keywords: "register roll call" }]),
  app("tupo", "Tupo", [{ label: "Chat", path: "/app/chat", keywords: "messages" }]),
];

describe("command palette", () => {
  it("scores prefixes above fuzzy matches and rejects non-matches", () => {
    expect(score("tup", "Tupo")).toBeGreaterThan(score("tp", "Tupo"));
    expect(score("xyz", "Tupo")).toBe(-1);
  });

  it("finds destinations by label and by keyword", () => {
    const items = buildItems(apps, []);
    expect(search(items, "attend")[0]).toMatchObject({ kind: "go", key: "tendo", path: "/attendance/mark" });
    expect(search(items, "roll call")[0]).toMatchObject({ kind: "go", key: "tendo" });
    expect(search(items, "messages")[0]).toMatchObject({ kind: "go", key: "tupo" });
  });

  it("empty query lists the apps first", () => {
    const items = buildItems(apps, [{ key: "mis", path: "/calendar", title: "Calendar", at: 1 }]);
    const res = search(items, "");
    expect(res.slice(0, 3).map((i) => i.kind)).toEqual(["app", "app", "app"]);
    expect(res[3]).toMatchObject({ kind: "recent", label: "Calendar" });
  });

  it("recent pages: newest first, de-duplicated, sign-in pages skipped", () => {
    let r = addRecent([], { key: "mis", path: "/home", title: "Home", at: 1 });
    r = addRecent(r, { key: "mis", path: "/calendar", title: "Calendar", at: 2 });
    r = addRecent(r, { key: "mis", path: "/home", title: "Home", at: 3 });
    r = addRecent(r, { key: "tupo", path: "/sso/callback", title: "x", at: 4 });
    expect(r.map((p) => p.path)).toEqual(["/home", "/calendar"]);
  });
});

describe("theme", () => {
  it("defaults to NGA MIS's theme, then the computer's", () => {
    expect(resolveTheme("mis", "dark", false)).toBe("dark");
    expect(resolveTheme("mis", undefined, true)).toBe("dark");
    expect(resolveTheme("mis", undefined, false)).toBe("light");
    expect(resolveTheme("light", "dark", true)).toBe("light");
    expect(resolveTheme("system", "light", true)).toBe("dark");
  });
});
