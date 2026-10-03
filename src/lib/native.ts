// Typed wrappers around the Rust commands and events (src-tauri/src/commands.rs).
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type AppKey = "mis" | "taskmentor" | "tendo" | "tupo";

export interface Destination {
  label: string;
  path: string;
  keywords: string;
}

export type OsPermission = "granted" | "denied" | "prompt" | "unknown";

export interface DesktopApp {
  key: AppKey;
  name: string;
  description: string;
  origin: string;
  base: string;
  startPath: string;
  color: string;
  sso: { clientId: string; callbackPath: string } | null;
  destinations: Destination[];
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

export interface Notice {
  id: number;
  app: AppKey;
  title: string;
  body: string;
  at: number;
  read: boolean;
}

export interface NoticeSummary {
  unread: Partial<Record<AppKey, number>>;
  badges: Partial<Record<AppKey, number>>;
  total: number;
}

export const native = {
  shellInfo: () => invoke<ShellInfo>("shell_info"),
  openApp: (key: AppKey) => invoke<void>("open_app", { key }),
  navigate: (key: AppKey, path: string) => invoke<void>("navigate_app", { key, path }),
  setInsets: (left: number, top: number, right: number, bottom: number) =>
    invoke<void>("set_insets", { left, top, right, bottom }),
  setWindowTheme: (theme: "light" | "dark") => invoke<void>("set_window_theme", { theme }),
  popupMenu: (kind: "tab" | "more" | "theme", x: number, y: number, key?: string) =>
    invoke<void>("popup_menu", { kind, key: key ?? null, x, y }),
  osPermission: () => invoke<OsPermission>("os_permission"),
  osPermissionRequest: () => invoke<OsPermission>("os_permission_request"),
  osOpenSettings: () => invoke<void>("os_open_settings"),
  osTestBanner: () => invoke<void>("os_test_banner"),
  focusSession: () => invoke<AppKey | null>("focus_session"),
  setCovered: (covered: boolean) => invoke<void>("set_covered", { covered }),
  reload: () => invoke<void>("reload_active"),
  back: () => invoke<void>("go_back"),
  forward: () => invoke<void>("go_forward"),
  print: () => invoke<void>("print_active"),
  openInBrowser: () => invoke<void>("open_active_in_browser"),
  showDownloads: (path?: string | null) => invoke<void>("show_downloads", { path: path ?? null }),
  signOut: () => invoke<void>("sign_out"),
  resetProfile: () => invoke<void>("reset_profile"),
  notices: () => invoke<Notice[]>("notices_list"),
  noticeSummary: () => invoke<NoticeSummary>("notices_summary"),
  openNotice: (id: number) => invoke<void>("notices_open", { id }),
  readAllNotices: () => invoke<void>("notices_read_all"),
  clearNotices: () => invoke<void>("notices_clear"),
};

type Events = {
  "nga://active": AppEvent;
  "nga://loading": AppEvent;
  "nga://loaded": AppEvent;
  "nga://title": AppEvent;
  "nga://download": { success: boolean; path: string | null };
  "nga://signed-out": null;
  /** MIS session state changed (true = signed in). */
  "nga://auth": boolean;
  /** These app webviews were closed (MIS signed out). */
  "nga://closed": AppKey[];
  /** A menu shortcut the shell handles: "sidebar" | "focus" | "notices". */
  "nga://menu": string;
  "nga://notices": NoticeSummary;
  /** A notice for an app that isn't on screen while NGA is focused. */
  "nga://notice": Notice;
  /** NGA MIS's own light/dark theme (from its page). */
  "nga://mis-theme": "light" | "dark";
  /** The app holding a meeting or quiz (banners from others are held), or null. */
  "nga://focus-session": AppKey | null;
  /** A setting changed natively (e.g. a tab's Mute menu item). */
  "nga://settings-changed": null;
};

export const on = <K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): Promise<UnlistenFn> =>
  listen<Events[K]>(event, (e) => handler(e.payload));
