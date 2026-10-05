// Date arithmetic for the date calculator. Dates are "YYYY-MM-DD" strings,
// computed in UTC so no timezone or daylight-saving shift can move a day.
import type { Key } from "../i18n";

export interface Holiday {
  date: string;
  name: Key;
  /** Islamic holidays follow the moon: the exact day is announced each year. */
  approximate?: boolean;
}

const DAY = 86_400_000;

export const parse = (d: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const day = new Date(t);
  return day.getUTCDate() === +m[3] && day.getUTCMonth() === +m[2] - 1 ? t : null;
};

export const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);

const ymd = (y: number, m: number, d: number) => fmt(Date.UTC(y, m - 1, d));

/** Easter Sunday (Gregorian, "Anonymous" algorithm). */
export function easter(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, month, day);
}

/** Eid al-Fitr and Eid al-Adha (expected dates; Rwanda confirms each year). */
const EID: Record<number, [string, string]> = {
  2025: ["2025-03-31", "2025-06-06"],
  2026: ["2026-03-20", "2026-05-27"],
  2027: ["2027-03-10", "2027-05-17"],
  2028: ["2028-02-27", "2028-05-05"],
  2029: ["2029-02-15", "2029-04-24"],
  2030: ["2030-02-05", "2030-04-14"],
};

/** Rwanda's public holidays in a year (Presidential Order on public holidays). */
export function rwandaHolidays(y: number): Holiday[] {
  const e = parse(easter(y))!;
  const aug1 = Date.UTC(y, 7, 1);
  const firstFridayAug = fmt(aug1 + (((5 - new Date(aug1).getUTCDay()) + 7) % 7) * DAY);
  const list: Holiday[] = [
    { date: ymd(y, 1, 1), name: "hol.newYear" },
    { date: ymd(y, 1, 2), name: "hol.newYear2" },
    { date: ymd(y, 2, 1), name: "hol.heroes" },
    { date: fmt(e - 2 * DAY), name: "hol.goodFriday" },
    { date: fmt(e + DAY), name: "hol.easterMonday" },
    { date: ymd(y, 4, 7), name: "hol.genocide" },
    { date: ymd(y, 5, 1), name: "hol.labour" },
    { date: ymd(y, 7, 1), name: "hol.independence" },
    { date: ymd(y, 7, 4), name: "hol.liberation" },
    { date: firstFridayAug, name: "hol.umuganura" },
    { date: ymd(y, 8, 15), name: "hol.assumption" },
    { date: ymd(y, 12, 25), name: "hol.christmas" },
    { date: ymd(y, 12, 26), name: "hol.boxing" },
  ];
  const eid = EID[y];
  if (eid) {
    list.push({ date: eid[0], name: "hol.eidFitr", approximate: true });
    list.push({ date: eid[1], name: "hol.eidAdha", approximate: true });
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

export function holidaySet(fromYear: number, toYear: number): Set<string> {
  const s = new Set<string>();
  for (let y = fromYear; y <= toYear; y++) for (const h of rwandaHolidays(y)) s.add(h.date);
  return s;
}

const isWeekend = (t: number) => {
  const d = new Date(t).getUTCDay();
  return d === 0 || d === 6;
};

export interface Difference {
  days: number;
  weeks: number;
  restDays: number;
  /** Mon–Fri, not a public holiday, counting both dates. */
  workingDays: number;
  weekendDays: number;
  holidays: number;
}

export function difference(from: string, to: string): Difference | null {
  let a = parse(from), b = parse(to);
  if (a === null || b === null) return null;
  const sign = b >= a ? 1 : -1;
  if (sign < 0) [a, b] = [b, a];
  const hol = holidaySet(new Date(a).getUTCFullYear(), new Date(b).getUTCFullYear());
  let working = 0, weekend = 0, holidays = 0;
  for (let t = a; t <= b; t += DAY) {
    if (isWeekend(t)) weekend++;
    else if (hol.has(fmt(t))) holidays++;
    else working++;
  }
  const days = Math.round((b - a) / DAY);
  return { days: sign * days, weeks: Math.floor(days / 7), restDays: days % 7, workingDays: working, weekendDays: weekend, holidays };
}

/** date + n calendar days (n may be negative). */
export function addDays(date: string, n: number): string | null {
  const t = parse(date);
  return t === null ? null : fmt(t + Math.trunc(n) * DAY);
}

/** date + n working days (skips weekends and public holidays). */
export function addWorkingDays(date: string, n: number): string | null {
  let t = parse(date);
  if (t === null) return null;
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(Math.trunc(n));
  const y = new Date(t).getUTCFullYear();
  const hol = holidaySet(y - 2, y + 3);
  while (left > 0) {
    t += step * DAY;
    if (!isWeekend(t) && !hol.has(fmt(t))) left--;
  }
  return fmt(t);
}

export const weekday = (date: string, lang: string): string => {
  const t = parse(date);
  if (t === null) return "";
  try {
    return new Intl.DateTimeFormat(lang === "rw" ? "rw-RW" : lang, { weekday: "long", timeZone: "UTC" }).format(t);
  } catch {
    return new Intl.DateTimeFormat("en", { weekday: "long", timeZone: "UTC" }).format(t);
  }
};

export const today = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
