// The command palette's items and search. Pure, so it is unit-tested.
import type { AppKey, DesktopApp } from "./native";
import type { RecentPage } from "./settings";

export type PaletteAction = "theme" | "focus" | "notices" | "settings" | "reload" | "print" | "signout";

export type PaletteItem =
  | { kind: "app"; id: string; label: string; hint: string; key: AppKey }
  | { kind: "go"; id: string; label: string; hint: string; key: AppKey; path: string; words: string }
  | { kind: "recent"; id: string; label: string; hint: string; key: AppKey; path: string }
  | { kind: "action"; id: string; label: string; hint: string; action: PaletteAction; words: string }
  | { kind: "tool"; id: string; label: string; hint: string; tool: string; words: string };

/** A tool as the palette lists it (labels already translated). */
export interface PaletteTool {
  id: string;
  label: string;
  hint: string;
  words: string;
}

const ACTIONS: Array<{ action: PaletteAction; label: string; words: string }> = [
  { action: "theme", label: "Switch light / dark", words: "theme dark light mode appearance" },
  { action: "focus", label: "Focus mode", words: "fullscreen hide distraction zen" },
  { action: "notices", label: "Show notifications", words: "bell alerts inbox" },
  { action: "settings", label: "Settings", words: "preferences options" },
  { action: "reload", label: "Reload this app", words: "refresh" },
  { action: "print", label: "Print this page", words: "pdf paper" },
  { action: "signout", label: "Sign out of this computer", words: "logout log out switch account" },
];

export function buildItems(apps: DesktopApp[], recent: RecentPage[], tools: PaletteTool[] = []): PaletteItem[] {
  const name = (k: AppKey) => apps.find((a) => a.key === k)?.name ?? k;
  return [
    ...apps.map((a, i) => ({ kind: "app" as const, id: `app:${a.key}`, label: a.name, hint: `${a.description} · ⌘${i + 1}`, key: a.key })),
    ...recent.slice(0, 8).map((r) => ({
      kind: "recent" as const,
      id: `recent:${r.key}:${r.path}`,
      label: r.title || r.path,
      hint: `${name(r.key)} · recent`,
      key: r.key,
      path: r.path,
    })),
    ...apps.flatMap((a) =>
      a.destinations.map((d) => ({
        kind: "go" as const,
        id: `go:${a.key}:${d.path}`,
        label: d.label,
        hint: a.name,
        key: a.key,
        path: d.path,
        words: `${d.keywords} ${a.name}`,
      })),
    ),
    ...tools.map((t) => ({ kind: "tool" as const, id: `tool:${t.id}`, label: t.label, hint: t.hint, tool: t.id, words: t.words })),
    ...ACTIONS.map((a) => ({ kind: "action" as const, id: `action:${a.action}`, label: a.label, hint: "Action", action: a.action, words: a.words })),
  ];
}

/** Subsequence match with bonuses for word starts and consecutive letters; -1 = no match. */
export function score(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t.startsWith(q)) return 1000 - t.length;
  const idx = t.indexOf(q);
  if (idx >= 0) return 800 - idx;
  let s = 0;
  let ti = 0;
  let prev = -2;
  for (const ch of q.replace(/\s+/g, "")) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    s += found === prev + 1 ? 8 : 1;
    if (found === 0 || /[\s/·-]/.test(t[found - 1])) s += 6;
    prev = found;
    ti = found + 1;
  }
  return s;
}

export function search(items: PaletteItem[], query: string, limit = 9): PaletteItem[] {
  if (!query.trim()) {
    // Empty: apps, then recent pages, then a few actions.
    return [
      ...items.filter((i) => i.kind === "app"),
      ...items.filter((i) => i.kind === "recent").slice(0, 4),
      ...items.filter((i) => i.kind === "action").slice(0, 3),
    ].slice(0, limit + 2);
  }
  return items
    .map((item) => {
      const label = score(query, item.label);
      const other = score(query, `${item.hint} ${"words" in item ? item.words : ""}`);
      const best = Math.max(label, other > 0 ? other / 2 : other);
      return { item, s: best + (item.kind === "app" ? 5 : 0) };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.item);
}

/** Remember a visited page (newest first, one per app+path, at most 20). */
export function addRecent(list: RecentPage[], page: RecentPage): RecentPage[] {
  if (!page.path || page.path === "/" || /\/(sso\/)?callback|\/login/.test(page.path)) return list;
  return [page, ...list.filter((r) => !(r.key === page.key && r.path === page.path))].slice(0, 20);
}
