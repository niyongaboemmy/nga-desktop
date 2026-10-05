// Tools Hub strings: English (source), French and Kinyarwanda.
// fr/rw must have every key (TypeScript enforces it). Kinyarwanda and French
// texts are reviewed by holders of TOOLS_TRANSLATIONS_MANAGE (plan §6.3.1).
import { useEffect, useState } from "react";
import { en } from "./en";
import { fr } from "./fr";
import { rw } from "./rw";

export type Lang = "en" | "fr" | "rw";
export type LangPref = Lang | "auto";
export type Key = keyof typeof en;
export type Dictionary = Record<Key, string>;
export type Translate = (key: Key, vars?: Record<string, string | number>) => string;

export const LANGS: Array<{ id: Lang; name: string }> = [
  { id: "en", name: "English" },
  { id: "fr", name: "Français" },
  { id: "rw", name: "Ikinyarwanda" },
];

export const dictionaries: Record<Lang, Dictionary> = { en, fr, rw };

export function translator(lang: Lang): Translate {
  const d = dictionaries[lang] ?? en;
  return (key, vars) => {
    let s = d[key] || en[key] || key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

export function detectLang(languages: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]): Lang {
  for (const l of languages) {
    const base = l.toLowerCase().split("-")[0];
    if (base === "fr" || base === "rw" || base === "en") return base;
  }
  return "en";
}

const KEY = "nga.tools.lang";

export const readLangPref = (): LangPref => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "en" || v === "fr" || v === "rw" ? v : "auto";
  } catch {
    return "auto";
  }
};

export const resolveLang = (pref: LangPref): Lang => (pref === "auto" ? detectLang() : pref);

/** The tools' language, shared by every NGA window (localStorage + storage events). */
export function useLang(): { lang: Lang; pref: LangPref; setPref: (p: LangPref) => void; t: Translate } {
  const [pref, setPrefState] = useState<LangPref>(readLangPref);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === KEY && setPrefState(readLangPref());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const setPref = (p: LangPref) => {
    try {
      if (p === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {
      /* storage blocked */
    }
    setPrefState(p);
  };
  const lang = resolveLang(pref);
  return { lang, pref, setPref, t: translator(lang) };
}
