// Typed wrappers around the tools' Rust commands (src-tauri/src/tools).
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Identity } from "../types";

export type TimerKind = "countdown" | "stopwatch" | "focus";

export interface Timer {
  id: number;
  label: string;
  kind: TimerKind;
  durationMs: number;
  elapsedMs: number;
  runningSince: number | null;
  finishedAt: number | null;
  laps: number[];
  focus: null | {
    workMs: number;
    breakMs: number;
    rounds: number;
    round: number;
    phase: "work" | "break";
    focusedMs: number;
  };
  createdAt: number;
}

export interface NewTimer {
  kind: TimerKind;
  label?: string;
  durationMs?: number;
  workMs?: number;
  breakMs?: number;
  rounds?: number;
}

export interface Display {
  index: number;
  name: string;
  width: number;
  height: number;
  primary: boolean;
  current: boolean;
}

export const toolsNative = {
  identity: () => invoke<Identity | null>("tools_identity"),
  /** The signed-in person's tool-data key (base64; tools/vault.rs). */
  vaultKey: (userId: number) => invoke<string | null>("tools_vault_key", { userId }),
  timers: () => invoke<Timer[]>("timers_list"),
  createTimer: (timer: NewTimer) => invoke<Timer>("timer_create", { timer }),
  timerAction: (id: number, action: "pause" | "resume" | "reset" | "restart" | "delete" | "lap") =>
    invoke<void>("timer_action", { id, action }),
  openWindow: (tool: string, title: string, present: boolean, onTop?: boolean, display?: number) =>
    invoke<void>("tools_window_open", { tool, title, present, onTop: onTop ?? null, display: display ?? null }),
  displays: () => invoke<Display[]>("tools_displays"),
  /** Saves to Downloads; returns the full path. */
  saveFile: (name: string, base64: string) => invoke<string>("tools_save_file", { name, data: base64 }),
  setShortcut: (on: boolean) => invoke<boolean>("tools_shortcut_set", { on }),
};

type ToolEvents = {
  "nga://identity": Identity | null;
  "nga://timers": Timer[];
  "nga://tool-alert": { title: string; body: string; focused: boolean };
};

export const onTool = <K extends keyof ToolEvents>(event: K, handler: (p: ToolEvents[K]) => void): Promise<UnlistenFn> =>
  listen<ToolEvents[K]>(event, (e) => handler(e.payload));

/** Text → base64 (UTF-8 safe), for saveFile. */
export const textToBase64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
