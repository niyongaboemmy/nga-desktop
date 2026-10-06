// What the games hub says about locks and times.
import type { Gate } from "./gate";
import type { Translate } from "../i18n";

export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
export const hhmm = (ms?: number) => (ms ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

export function lockText(gate: Gate, gameId: string, t: Translate, usedMin: number): string {
  if (gate.open) return "";
  const time = hhmm(gate.until);
  switch (gate.reason) {
    case "stale": return t("games.lock.stale");
    case "exam": return t("games.lock.exam", { label: gate.label ?? "", time });
    case "lesson": return t("games.lock.lesson", { label: gate.label ?? "", time });
    case "parent": return t("games.lock.parent");
    case "off": return t("games.lock.off");
    case "disabled": return gameId === "igisoro" ? t("games.lock.igisoro") : t("games.lock.disabled");
    case "quiet": return t("games.lock.quiet", { time });
    case "budget": return t("games.lock.budget", { n: Math.round(usedMin) });
    case "cooldown": return t("games.lock.cooldown", { time });
  }
}
