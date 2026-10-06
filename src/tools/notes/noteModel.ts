// Notes: plain Markdown text with optional #tags and $maths$.
import { marked } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";

export interface Note {
  id: string;
  body: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export const newNote = (now = Date.now()): Note => ({
  id: `${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
  body: "",
  pinned: false,
  createdAt: now,
  updatedAt: now,
});

/** First non-empty line, without Markdown markers. */
export function title(n: Note): string {
  const line = n.body.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.replace(/^#+\s*/, "").replace(/[*_`>]/g, "").slice(0, 80);
}

export function tags(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/(^|\s)#([\p{L}\p{N}_-]{2,30})/gu)) out.add(m[2].toLowerCase());
  return [...out];
}

/** Pinned first, then most recently edited. */
export function sortNotes(list: Note[]): Note[] {
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

/** Every word must appear (in the text or as a #tag); case and accents ignored. */
export function searchNotes(list: Note[], query: string): Note[] {
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean).map((w) => w.replace(/^#/, ""));
  if (!words.length) return sortNotes(list);
  return sortNotes(list.filter((n) => {
    const hay = fold(n.body);
    return words.every((w) => hay.includes(w));
  }));
}

/** Markdown → safe HTML, with $inline$ and $$display$$ maths (KaTeX). */
export function render(body: string): string {
  const maths: string[] = [];
  const keep = (tex: string, display: boolean) => {
    try {
      maths.push(katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "htmlAndMathml" }));
    } catch {
      maths.push(tex);
    }
    return `@@MATH${maths.length - 1}@@`;
  };
  const src = body
    // AI models also write \[ … \] and \( … \) (LaTeX's own delimiters).
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, t: string) => keep(t, true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, t: string) => keep(t, false))
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, t: string) => keep(t, true))
    .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_, pre: string, t: string) => pre + keep(t, false));
  const html = marked.parse(src, { async: false, gfm: true, breaks: true }) as string;
  const withMath = html.replace(/@@MATH(\d+)@@/g, (_, i: string) => maths[+i] ?? "");
  return DOMPurify.sanitize(withMath, { USE_PROFILES: { html: true, mathMl: true, svg: true }, ADD_ATTR: ["aria-hidden"] });
}
