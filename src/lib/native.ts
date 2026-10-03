// Typed wrappers around the Rust commands and events (src-tauri/src/commands.rs).
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type AppKey = "mis" | "taskmentor" | "tendo" | "tupo";

export interface DesktopApp {
  key: AppKey;
  name: string;
  description: string;
  origin: string;
  base: string;
  startPath: string;
  color: string;
  sso: { clientId: string; callbackPath: string } | null;
}

export interface ShellInfo {
  version: string;
  env: "production" | "development";
  os: string;
  webview: string;
  apps: DesktopApp[];
  updater: boolean;
}

export interface AppEvent {
  key: AppKey;
  url?: string;
  title?: string;
}

export const native = {
  shellInfo: () => invoke<ShellInfo>("shell_info"),
  openApp: (key: AppKey) => invoke<void>("open_app", { key }),
  setInsets: (left: number, top: number) => invoke<void>("set_insets", { left, top }),
  setCovered: (covered: boolean) => invoke<void>("set_covered", { covered }),
  reload: () => invoke<void>("reload_active"),
  back: () => invoke<void>("go_back"),
  forward: () => invoke<void>("go_forward"),
  print: () => invoke<void>("print_active"),
  openInBrowser: () => invoke<void>("open_active_in_browser"),
  showDownloads: (path?: string | null) => invoke<void>("show_downloads", { path: path ?? null }),
  signOut: () => invoke<void>("sign_out"),
  resetProfile: () => invoke<void>("reset_profile"),
};

type Events = {
  "nga://active": AppEvent;
  "nga://loading": AppEvent;
  "nga://loaded": AppEvent;
  "nga://title": AppEvent;
  "nga://download": { success: boolean; path: string | null };
  "nga://signed-out": null;
};

export const on = <K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): Promise<UnlistenFn> =>
  listen<Events[K]>(event, (e) => handler(e.payload));
