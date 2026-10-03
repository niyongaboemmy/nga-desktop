// Shell preferences (start app, sidebar), kept by the store plugin in the app data dir.
import { load, type Store } from "@tauri-apps/plugin-store";
import type { AppKey } from "./native";
import type { ThemePref } from "./theme";

// Rust reads some of these from the same store file (keys must match):
// backgroundSignIn (auth.rs), keepRunning (lib.rs), mutedApps + dndUntil (notifications.rs).
export interface Settings {
  startApp: AppKey | "last";
  lastApp?: AppKey;
  collapsed: boolean;
  backgroundSignIn: boolean;
  keepRunning: boolean;
  mutedApps: AppKey[];
  /** Do Not Disturb until this time (ms); 0 = off. */
  dndUntil: number;
  theme: ThemePref;
  /** NGA MIS's last reported theme (written by Rust, so it's known before MIS loads). */
  misTheme?: "light" | "dark";
  /** The welcome / turn-on-notifications strip was answered. */
  onboarded: boolean;
  recent: RecentPage[];
}

export interface RecentPage {
  key: AppKey;
  path: string;
  title: string;
  at: number;
}

const defaults: Settings = {
  startApp: "last",
  collapsed: false,
  backgroundSignIn: true,
  keepRunning: true,
  mutedApps: [],
  dndUntil: 0,
  theme: "mis",
  onboarded: false,
  recent: [],
};
let store: Promise<Store> | null = null;
const get = () => (store ??= load("settings.json", { defaults: {}, autoSave: 300 }));

export async function readSettings(): Promise<Settings> {
  try {
    const s = await get();
    const out = { ...defaults };
    for (const k of Object.keys(defaults).concat("lastApp", "misTheme") as (keyof Settings)[]) {
      const v = await s.get(k);
      if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
    }
    return out;
  } catch {
    return { ...defaults };
  }
}

export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  try {
    await (await get()).set(key, value);
  } catch {
    /* preferences are a convenience */
  }
}
