import { useState } from "react";
import { BellRing, X } from "lucide-react";
import { native } from "../lib/native";
import { useLang } from "../tools/i18n";

/** First run: ask to turn on notifications (macOS shows its own permission prompt). */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const { t } = useLang();
  return (
    <div className="strip" role="region" aria-label={t("shell.onboard.label")}>
      <BellRing size={17} className="strip-icon" />
      <span>
        <strong>{t("shell.onboard.title")}</strong>{" "}
        <span className="muted">{t("shell.onboard.body")}</span>
      </span>
      <button
        className="btn primary sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const p = await native.osPermissionRequest();
          if (p !== "denied") await native.osTestBanner();
          else await native.osOpenSettings();
          onDone();
        }}
      >
        {t("shell.onboard.turnOn")}
      </button>
      <button className="icon-btn" onClick={onDone} title={t("shell.onboard.notNow")} aria-label={t("shell.onboard.notNow")}><X size={15} /></button>
    </div>
  );
}
