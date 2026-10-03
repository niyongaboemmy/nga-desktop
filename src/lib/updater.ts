// In-app updates (only in release builds that carry an updater key).
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export async function findUpdate(): Promise<Update | null> {
  try {
    return await check({ timeout: 20_000 });
  } catch (e) {
    console.warn("update check failed", e);
    return null;
  }
}

/** Download, install and restart. Only on the user's click: never mid-quiz or mid-meeting. */
export async function installUpdate(update: Update, onProgress: (pct: number) => void) {
  let total = 0;
  let done = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") total = event.data.contentLength ?? 0;
    if (event.event === "Progress") {
      done += event.data.chunkLength;
      if (total) onProgress(Math.round((done / total) * 100));
    }
  });
  await relaunch();
}
