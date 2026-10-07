import { ExternalLink, Globe, X } from "lucide-react";
import { native } from "../lib/native";
import { useLang } from "../tools/i18n";

/**
 * Shown over the app area while signing in through the browser
 * (browser_signin.rs): first while the person is in their browser, then
 * while NGA MIS finishes signing in with the code it got back.
 */
export function SigninProgress({ phase }: { phase: "waiting" | "completing" }) {
  const { t } = useLang();
  if (phase === "completing") {
    return (
      <div className="screen">
        <div className="splash-card">
          <div className="spinner-ring" aria-hidden="true" />
          <h2>{t("shell.signin.completing")}</h2>
          <p className="muted">{t("shell.signin.completingBody")}</p>
          <div className="shimmer" />
        </div>
      </div>
    );
  }
  return (
    <div className="screen">
      <div className="splash-card">
        <div className="browser-badge" aria-hidden="true">
          <Globe size={30} />
          <span className="pulse-dot" />
        </div>
        <h2>{t("shell.signin.continue")}</h2>
        <p className="muted">{t("shell.signin.continueBody")}</p>
        <div className="row center">
          <button className="btn" onClick={() => native.signinReopen()}>
            <ExternalLink size={16} /> {t("shell.signin.reopen")}
          </button>
          <button className="btn" onClick={() => native.signinCancel()}>
            <X size={16} /> {t("shell.common.cancel")}
          </button>
        </div>
        <p className="muted small">{t("shell.signin.closesItself")}</p>
      </div>
    </div>
  );
}
