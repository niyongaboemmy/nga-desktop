// Published translations from NGA MIS (the translation workspace, plan §6.3.1),
// applied over the strings bundled in the app — no app update needed. Each string
// carries the hash of the English it translates; when the English has changed
// since, the bundled text is used instead (a stale translation never shows).
// Cached per language in localStorage, shared by every NGA window.

export interface Override { t: string; h: string }
export interface OverrideSet { release: number; strings: Record<string, Override> }

const KEY = (lang: string) => `nga.tools.i18n.${lang}`;
export const OVERRIDE_EVENT = "nga-i18n-overrides";

/** FNV-1a 32-bit as 8 hex chars — the same as MIS services/desktop/translations.ts. */
export function sourceHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const memo = new Map<string, OverrideSet | null>();

export function readOverrides(lang: string): OverrideSet | null {
  if (memo.has(lang)) return memo.get(lang)!;
  let v: OverrideSet | null = null;
  try {
    const raw = localStorage.getItem(KEY(lang));
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed.release === "number" && parsed.strings && typeof parsed.strings === "object") v = parsed;
  } catch {
    v = null;
  }
  memo.set(lang, v);
  return v;
}

export function writeOverrides(lang: string, set: OverrideSet) {
  memo.set(lang, set);
  try {
    localStorage.setItem(KEY(lang), JSON.stringify(set));
  } catch {
    /* storage blocked: this window still uses them */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OVERRIDE_EVENT));
}

/** Another window wrote new overrides: forget the memo so the next read sees them. */
export function forgetOverrides(storageKey: string | null) {
  if (!storageKey) return memo.clear();
  const m = /^nga\.tools\.i18n\.(\w+)$/.exec(storageKey);
  if (m) memo.delete(m[1]);
}

/** The published text for a key, if it still translates the current English. */
export function overrideFor(lang: string, key: string, english: string): string | null {
  const o = readOverrides(lang)?.strings[key];
  return o && o.t && o.h === sourceHash(english) ? o.t : null;
}

/** Merge a server answer ({release, strings} or {release, unchanged}) into the cache. Pure. */
export function nextOverrides(current: OverrideSet | null, answer: { release: number; strings?: Record<string, Override>; unchanged?: boolean }): OverrideSet | null {
  if (answer.unchanged) return null;
  if (!answer.strings) return null;
  if (current && current.release === answer.release) return null;
  return { release: answer.release, strings: answer.strings };
}
