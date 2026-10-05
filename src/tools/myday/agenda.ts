// My Day: the agenda model (pure, unit-tested). Times are shown in Kigali time,
// like NGA MIS, whatever the computer's own time zone.
import type { AppKey, DesktopApp } from "../../lib/native";

export interface AgendaItem {
  key: string;
  kind: string;
  title: string;
  detail: string | null;
  location: string | null;
  link: string | null;
  color: string | null;
  role: "teaching" | "attending" | "other";
  critical: boolean;
  start: string;
  end: string | null;
}

export interface Agenda {
  now: string;
  today: string;
  days: number;
  items: AgendaItem[];
}

export const TZ = "Africa/Kigali";

/** YYYY-MM-DD of an instant in Kigali. */
export const kigaliDay = (iso: string | number | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

export const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/** Items grouped by Kigali day, in order. */
export function byDay(items: AgendaItem[]): Map<string, AgendaItem[]> {
  const out = new Map<string, AgendaItem[]>();
  for (const it of [...items].sort((a, b) => a.start.localeCompare(b.start))) {
    const d = kigaliDay(it.start);
    out.set(d, [...(out.get(d) ?? []), it]);
  }
  return out;
}

/** End of an item: its end, or 1 minute after a point event (a quiz opening). */
const endOf = (it: AgendaItem) => (it.end ? Date.parse(it.end) : Date.parse(it.start) + 60_000);

/** What is happening now, and what's next (today only). */
export function nowNext(items: AgendaItem[], now: number): { current: AgendaItem | null; next: AgendaItem | null } {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start));
  const today = kigaliDay(now);
  const current = sorted.find((it) => Date.parse(it.start) <= now && now < endOf(it) && it.end) ?? null;
  const next = sorted.find((it) => Date.parse(it.start) > now && kigaliDay(it.start) === today) ?? null;
  return { current, next };
}

/** "in 8 min", "in 1 h 05", "now". */
export function until(ms: number): { h: number; m: number } {
  const total = Math.max(0, Math.ceil(ms / 60_000));
  return { h: Math.floor(total / 60), m: total % 60 };
}

/** Where a link opens: an NGA app tab and a path, or null (unknown site). */
export function linkTarget(link: string | null, apps: Pick<DesktopApp, "key" | "origin">[]): { key: AppKey; path: string } | null {
  if (!link) return null;
  if (link.startsWith("/")) return { key: "mis", path: link };
  try {
    const u = new URL(link);
    const app = apps.find((a) => new URL(a.origin).origin === u.origin);
    return app ? { key: app.key, path: `${u.pathname}${u.search}${u.hash}` } : null;
  } catch {
    return null;
  }
}

export type KindStyle = { icon: string; color: string };

/** A colour per kind when the timetable has none. */
export const KIND_COLOR: Record<string, string> = {
  lesson: "#3b82f6",
  activity: "#14b8a6",
  office_hours: "#a855f7",
  quiz_open: "#f59e0b",
  quiz_close: "#ef4444",
  assignment_due: "#ef4444",
  meeting: "#22c55e",
  event: "#64748b",
};
