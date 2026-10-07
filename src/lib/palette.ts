// The command palette's items and search. Pure, so it is unit-tested.
import type { AppKey, DesktopApp } from "./native";
import type { RecentPage } from "./settings";
import { translator, type Key, type Translate } from "../tools/i18n";

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

const ACTIONS: Array<{ action: PaletteAction; label: Key; words: string }> = [
  { action: "theme", label: "shell.action.theme", words: "theme dark light mode appearance" },
  { action: "focus", label: "shell.action.focus", words: "fullscreen hide distraction zen" },
  { action: "notices", label: "shell.action.notices", words: "bell alerts inbox" },
  { action: "settings", label: "shell.settings.title", words: "preferences options" },
  { action: "reload", label: "shell.action.reload", words: "refresh" },
  { action: "print", label: "shell.action.print", words: "pdf paper" },
  { action: "signout", label: "shell.action.signout", words: "logout log out switch account" },
];

// The registry (registry.rs) sends English labels; the shell shows them in the chosen language.
const DESTINATIONS: Record<string, Key> = {
  Home: "shell.dest.home",
  "Timetable & calendar": "shell.dest.calendar",
  "Lesson notes": "shell.dest.lessonNotes",
  Reminders: "shell.dest.reminders",
  "My learning": "shell.dest.myLearning",
  "E-learning courses": "shell.dest.elearning",
  "Scheme of work": "shell.dest.schemeOfWork",
  Documents: "shell.dest.documents",
  "Office hours": "shell.dest.officeHours",
  Reporting: "shell.dest.reporting",
  Profile: "shell.dest.profile",
  Dashboard: "shell.dest.dashboard",
  Courses: "shell.dest.courses",
  Quizzes: "shell.dest.quizzes",
  "My quizzes": "shell.dest.myQuizzes",
  Assignments: "shell.dest.assignments",
  Submissions: "shell.dest.submissions",
  Grades: "shell.dest.grades",
  "Question bank": "shell.dest.questionBank",
  Ranking: "shell.dest.ranking",
  "Live proctoring": "shell.dest.proctoring",
  Today: "shell.dest.today",
  "Take attendance": "shell.dest.takeAttendance",
  "This week": "shell.dest.thisWeek",
  "Attendance records": "shell.dest.attendanceRecords",
  "Attendance report": "shell.dest.attendanceReport",
  Excuses: "shell.dest.excuses",
  "Log discipline": "shell.dest.logDiscipline",
  "Discipline records": "shell.dest.disciplineRecords",
  Reports: "shell.dest.reports",
  Chat: "shell.dest.chat",
  Feed: "shell.dest.feed",
  Mail: "shell.dest.mail",
  Meetings: "shell.dest.meetings",
  "New meeting": "shell.dest.newMeeting",
  Files: "shell.dest.files",
  Reels: "shell.dest.reels",
};

const APP_DESCRIPTIONS: Record<AppKey, Key> = {
  mis: "shell.app.mis.desc",
  taskmentor: "shell.app.taskmentor.desc",
  tendo: "shell.app.tendo.desc",
  tupo: "shell.app.tupo.desc",
};

/** An app's one-line description in the chosen language (the registry's English otherwise). */
export const appDescription = (app: DesktopApp, t: Translate): string =>
  APP_DESCRIPTIONS[app.key] ? t(APP_DESCRIPTIONS[app.key]) : app.description;

/** A destination label in the chosen language (unknown labels stay as sent). */
export const destinationLabel = (label: string, t: Translate): string => (DESTINATIONS[label] ? t(DESTINATIONS[label]) : label);

const english = translator("en");

export function buildItems(apps: DesktopApp[], recent: RecentPage[], tools: PaletteTool[] = [], t: Translate = english): PaletteItem[] {
  const name = (k: AppKey) => apps.find((a) => a.key === k)?.name ?? k;
  return [
    ...apps.map((a, i) => ({ kind: "app" as const, id: `app:${a.key}`, label: a.name, hint: `${appDescription(a, t)} · ⌘${i + 1}`, key: a.key })),
    ...recent.slice(0, 8).map((r) => ({
      kind: "recent" as const,
      id: `recent:${r.key}:${r.path}`,
      label: r.title || r.path,
      hint: `${name(r.key)} · ${t("shell.palette.recent")}`,
      key: r.key,
      path: r.path,
    })),
    ...apps.flatMap((a) =>
      a.destinations.map((d) => ({
        kind: "go" as const,
        id: `go:${a.key}:${d.path}`,
        label: destinationLabel(d.label, t),
        hint: a.name,
        key: a.key,
        path: d.path,
        // The English label stays searchable whatever the language.
        words: `${d.keywords} ${d.label} ${a.name}`,
      })),
    ),
    ...tools.map((t) => ({ kind: "tool" as const, id: `tool:${t.id}`, label: t.label, hint: t.hint, tool: t.id, words: t.words })),
    ...ACTIONS.map((a) => ({ kind: "action" as const, id: `action:${a.action}`, label: t(a.label), hint: t("shell.palette.action"), action: a.action, words: `${a.words} ${english(a.label)}` })),
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
