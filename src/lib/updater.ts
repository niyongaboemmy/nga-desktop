// In-app updates: the checks and the install run natively (src-tauri/src/updates.rs);
// the shell shows them (title-bar pill, toast, Settings → Updates).
import { native, type UpdateInfo } from "./native";

export type { UpdateInfo };

/** The state the shell shows: nothing yet, checking, up to date, or a newer version. */
export type UpdateState = { kind: "idle" } | { kind: "checking" } | { kind: "current" } | { kind: "available"; info: UpdateInfo } | { kind: "error"; message: string };

export async function checkNow(): Promise<UpdateState> {
  try {
    const info = await native.updateCheck();
    return info ? { kind: "available", info } : { kind: "current" };
  } catch (e) {
    return { kind: "error", message: String(e) };
  }
}

/** Only on the person's click: it restarts NGA, so never in the middle of a quiz or meeting. */
export async function installNow(): Promise<void> {
  await native.updateInstall();
}
