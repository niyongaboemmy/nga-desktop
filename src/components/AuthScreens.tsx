import { LogIn } from "lucide-react";
import type { DesktopApp } from "../lib/native";
import { useLang } from "../tools/i18n";

/** While NGA signs out of every app (Settings, or "Sign out" inside any app). */
export function SigningOutScreen() {
  const { t } = useLang();
  return (
    <div className="screen">
      <div className="splash-card">
        <div className="spinner-ring" aria-hidden="true" />
        <h2>{t("shell.signout.title")}</h2>
        <p className="muted">{t("shell.signout.body")}</p>
        <div className="shimmer" />
      </div>
    </div>
  );
}

/**
 * An app tab while nobody is signed in: one sign-in, in NGA MIS, for all of
 * them (instead of MIS's sign-in form inside every tab).
 */
export function SignedOutScreen({ app, onSignIn }: { app: DesktopApp; onSignIn: () => void }) {
  const { t } = useLang();
  return (
    <div className="screen" style={{ ["--app" as string]: app.color }}>
      <div className="splash-card">
        <img className="screen-icon" src={`/apps/${app.key}.png`} alt="" />
        <h2>{t("shell.signedOut.title", { app: app.name })}</h2>
        <p className="muted">{t("shell.signedOut.body", { app: app.name })}</p>
        <div className="row center">
          <button className="btn primary" onClick={onSignIn}>
            <LogIn size={16} /> {t("shell.signedOut.button")}
          </button>
        </div>
      </div>
    </div>
  );
}
