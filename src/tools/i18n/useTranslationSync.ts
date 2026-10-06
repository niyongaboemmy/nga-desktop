// Keeps this computer's published translations current (main window only): on
// sign-in, on a language change, and every 5 minutes. Other windows pick the new
// strings up through localStorage (useLang listens).
import { useEffect } from "react";
import { misCall } from "../shared/api";
import { nextOverrides, readOverrides, writeOverrides, type Override } from "./overrides";
import { permissionFlag } from "../registry";
import type { Lang } from "./index";
import type { Identity } from "../types";

/** May this person use the translation workspace? (Remembered per user for the launcher.) */
function checkPermission(userId: number) {
  misCall({ method: "GET", path: "/desktop/tools/i18n/workspace/fr", timeoutMs: 20_000 })
    .then(() => localStorage.setItem(permissionFlag("translations", userId), "1"))
    .catch((e: { status?: number }) => {
      if (e?.status === 403) localStorage.removeItem(permissionFlag("translations", userId));
    })
    .catch(() => undefined);
}

export function useTranslationSync(identity: Identity | null, lang: Lang) {
  useEffect(() => {
    if (!identity || identity.persona === "parent") return;
    checkPermission(identity.userId);
    const id = window.setInterval(() => checkPermission(identity.userId), 30 * 60_000);
    return () => window.clearInterval(id);
  }, [identity?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!identity || lang === "en") return;
    let alive = true;
    const sync = () => {
      const current = readOverrides(lang);
      misCall<{ release: number; strings?: Record<string, Override>; unchanged?: boolean }>({
        method: "GET",
        path: `/desktop/tools/i18n/${lang}`,
        query: { since: current?.release ?? 0 },
        timeoutMs: 20_000,
      })
        .then((answer) => {
          if (!alive || !answer) return;
          const next = nextOverrides(current, answer);
          if (next) writeOverrides(lang, next);
        })
        .catch(() => undefined); // offline or an older MIS: the cached/bundled strings stay
    };
    sync();
    const id = window.setInterval(sync, 5 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [identity?.userId, lang]); // eslint-disable-line react-hooks/exhaustive-deps
}
