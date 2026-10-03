// Per-app load state as the shell sees it, driven by events from Rust.
import type { AppKey } from "./native";

export type Status = "idle" | "starting" | "ready";

export interface AppView {
  status: Status;
  /** A page inside an already-shown app is loading (thin progress bar only). */
  busy: boolean;
  title?: string;
  url?: string;
  /** When the current first load began (ms), for the "taking long" screen. */
  startedAt?: number;
}

export type Views = Partial<Record<AppKey, AppView>>;

export type Action =
  | { type: "opened"; key: AppKey; at: number }
  | { type: "loading"; key: AppKey; url?: string }
  | { type: "loaded"; key: AppKey; url?: string }
  | { type: "title"; key: AppKey; title?: string }
  | { type: "retry"; key: AppKey; at: number }
  | { type: "closed"; keys: AppKey[] }
  | { type: "reset" };

const blank: AppView = { status: "idle", busy: false };

export function reduce(views: Views, action: Action): Views {
  if (action.type === "reset") return {};
  if (action.type === "closed") {
    const next = { ...views };
    for (const k of action.keys) delete next[k];
    return next;
  }
  const cur = views[action.key] ?? blank;
  switch (action.type) {
    case "opened":
      return cur.status === "idle" ? { ...views, [action.key]: { ...cur, status: "starting", startedAt: action.at } } : views;
    case "retry":
      return cur.status === "ready" ? views : { ...views, [action.key]: { ...cur, status: "starting", startedAt: action.at } };
    case "loading":
      return { ...views, [action.key]: { ...cur, busy: cur.status === "ready", url: action.url ?? cur.url } };
    case "loaded":
      return { ...views, [action.key]: { ...cur, status: "ready", busy: false, url: action.url ?? cur.url } };
    case "title":
      return { ...views, [action.key]: { ...cur, title: action.title } };
  }
}

/** After this long without a first page, offer Retry / Open in browser. */
export const SLOW_MS = 20_000;

export const isSlow = (view: AppView | undefined, now: number) =>
  !!view && view.status === "starting" && view.startedAt !== undefined && now - view.startedAt >= SLOW_MS;
