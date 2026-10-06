// Translation workspace, the pure part: each string's status, what is waiting to be
// published, and the checks a translation must pass (plan §6.3.1).
import { sourceHash, type Override } from "../i18n/overrides";

export type TrLang = "fr" | "rw";
export type TrStatus = "untouched" | "ai_draft" | "draft" | "approved" | "outdated";

export interface TrEntry {
  text: string;
  status: "draft" | "ai_draft" | "approved";
  sourceHash: string;
  updatedBy: string;
  updatedAt: string;
  approvedBy: string | null;
}

export interface Row {
  key: string;
  group: string;
  en: string;
  /** What people see now in the app: the published correction or the bundled text. */
  current: string;
  /** The edit in progress (MIS), if any. */
  entry: TrEntry | null;
  status: TrStatus;
  /** An approved edit that isn't in the latest release yet. */
  unpublished: boolean;
}

/** "games.lock.budget" → "games"; "tool.pdf.desc" → "pdf" (tools are grouped by tool). */
export function groupOf(key: string): string {
  const [a, b] = key.split(".");
  return (a === "tool" || a === "game") && b ? b : a;
}

export const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(", ");

/** Why a translation can't be saved, or null. */
export function problem(en: string, text: string): "empty" | "placeholders" | "long" | null {
  const t = text.trim();
  if (!t) return "empty";
  if (t.length > 2000) return "long";
  if (placeholders(t) !== placeholders(en)) return "placeholders";
  return null;
}

export function buildRows(
  en: Record<string, string>,
  bundled: Record<string, string>,
  entries: Record<string, TrEntry>,
  published: Record<string, Override>,
): Row[] {
  return Object.keys(en).map((key) => {
    const h = sourceHash(en[key]);
    const pub = published[key];
    const current = pub && pub.h === h ? pub.t : bundled[key] ?? "";
    const entry = entries[key] ?? null;
    const status: TrStatus = entry ? (entry.sourceHash !== h ? "outdated" : entry.status) : "untouched";
    const unpublished = !!entry && status === "approved" && (!pub || pub.t !== entry.text || pub.h !== h);
    return { key, group: groupOf(key), en: en[key], current, entry, status, unpublished };
  });
}

export function counts(rows: Row[]): Record<TrStatus | "unpublished", number> {
  const c = { untouched: 0, ai_draft: 0, draft: 0, approved: 0, outdated: 0, unpublished: 0 };
  for (const r of rows) {
    c[r.status]++;
    if (r.unpublished) c.unpublished++;
  }
  return c;
}

/** Search (key, English or translation, accents ignored) and filters. */
export function filterRows(rows: Row[], q: string, status: TrStatus | "all" | "unpublished", group: string): Row[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const needle = norm(q.trim());
  return rows.filter(
    (r) =>
      (status === "all" || (status === "unpublished" ? r.unpublished : r.status === status)) &&
      (!group || r.group === group) &&
      (!needle || norm(`${r.key} ${r.en} ${r.current} ${r.entry?.text ?? ""}`).includes(needle)),
  );
}

/** Fixed terms the AI must keep as they are. */
export const GLOSSARY = ["NGA", "NGA MIS", "Task Mentor", "Tendo", "Tupo", "Igisoro", "PDF", "OCR", "QR"];
