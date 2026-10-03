// Shell preferences (start app, sidebar), kept by the store plugin in the app data dir.
import { load, type Store } from "@tauri-apps/plugin-store";
import type { AppKey } from "./native";

export interface Settings {
  startApp: AppKey | "last";
  lastApp?: AppKey;
  collapsed: boolean;
}

const defaults: Settings = { startApp: "last", collapsed: false };
let store: Promise<Store> | null = null;
const get = () => (store ??= load("settings.json", { defaults: {}, autoSave: 300 }));

export async function readSettings(): Promise<Settings> {
  try {
    const s = await get();
    const out = { ...defaults };
    for (const k of Object.keys(defaults).concat("lastApp") as (keyof Settings)[]) {
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
