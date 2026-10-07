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

/** A newer NGA Desktop on the update service (updates.rs). */
export interface UpdateInfo {
  version: string;
  current: string;
  notes: string | null;
  date: string | null;
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
  /** `user`: the person picked it in the shell (then MIS saves it to their account). */
  setWindowTheme: (theme: "light" | "dark", user = false) => invoke<void>("set_window_theme", { theme, user }),
  popupMenu: (kind: "tab" | "more" | "theme", x: number, y: number, key?: string) =>
    invoke<void>("popup_menu", { kind, key: key ?? null, x, y }),
  osPermission: () => invoke<OsPermission>("os_permission"),
  osPermissionRequest: () => invoke<OsPermission>("os_permission_request"),
  osOpenSettings: () => invoke<void>("os_open_settings"),
  osTestBanner: () => invoke<void>("os_test_banner"),
  focusSession: () => invoke<AppKey | null>("focus_session"),
  signinCancel: () => invoke<void>("signin_cancel"),
  signinReopen: () => invoke<void>("signin_reopen"),
  /** "palette", "shortcuts", "tools" (the launcher) or "tool:<id>". */
  overlayShow: (view: "palette" | "shortcuts" | "tools" | `tool:${string}`) => invoke<void>("overlay_show", { view }),
  overlayHide: () => invoke<void>("overlay_hide"),
  /** From the overlay: let the main shell do this (theme, focus, notices, settings, reload, print, signout). */
  overlayAction: (action: string) => invoke<void>("overlay_action", { action }),
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
  /** "Remind me later": back as a banner after 10, 60 or 180 minutes. */
  snoozeNotice: (id: number, minutes: 10 | 60 | 180) => invoke<void>("notices_snooze", { id, minutes }),
  clearNotices: () => invoke<void>("notices_clear"),
  /** Asks the update service now (null: up to date or no updater). */
  updateCheck: () => invoke<UpdateInfo | null>("update_check"),
  /** Downloads, installs and restarts NGA. */
  updateInstall: () => invoke<void>("update_install"),
  /** Settings → Updates → install automatically when the computer is idle (default on). */
  updateAutoGet: () => invoke<boolean>("update_auto_get"),
  updateAutoSet: (on: boolean) => invoke<void>("update_auto_set", { on }),
  /** Settings → General → start NGA (hidden) when the computer starts. */
  autostartGet: () => invoke<boolean>("autostart_get"),
  autostartSet: (on: boolean) => invoke<void>("autostart_set", { on }),
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
  /** The theme was switched inside one of the apps (theme.rs); follow it. */
  "nga://app-theme": "light" | "dark";
  /** The app holding a meeting or quiz (banners from others are held), or null. */
  "nga://focus-session": AppKey | null;
  /** Signing out of every NGA app: "start", then "done". */
  "nga://signout": "start" | "done";
  /** This app is signing in (again) behind its loading screen. */
  "nga://syncing": AppKey;
  /** Browser sign-in progress (browser_signin.rs). */
  "nga://signin": "waiting" | "completing" | "idle";
  /** A short confirmation from the native side ("Link copied"). */
  "nga://toast": string;
  /** Overlay window: which view to show ("palette"), or "closed". */
  "nga://overlay": string;
  /** A setting changed natively (e.g. a tab's Mute menu item). */
  "nga://settings-changed": null;
  /** A newer version is available; `announce` the first time this version is seen. */
  "nga://update": { info: UpdateInfo; announce: boolean };
  /** Update download progress, 0-100. */
  "nga://update-progress": number;
};

export const on = <K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): Promise<UnlistenFn> =>
  listen<Events[K]>(event, (e) => handler(e.payload));
