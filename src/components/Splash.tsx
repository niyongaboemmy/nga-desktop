import { ExternalLink, RotateCw, WifiOff } from "lucide-react";
import { native, type DesktopApp } from "../lib/native";
import { useLang } from "../tools/i18n";

/** Shown in the app area until the app's first page has loaded. */
export function Splash({ app, slow, onRetry }: { app: DesktopApp; slow: boolean; onRetry: () => void }) {
  const { t } = useLang();
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  if (!slow && !offline) {
    return (
      <div className="screen" style={{ ["--app" as string]: app.color }}>
        <div className="splash-card">
          <img className="screen-icon breathe" src={`/apps/${app.key}.png`} alt="" />
          <strong>{app.name}</strong>
          <div className="shimmer" />
          <p className="muted small">{app.sso ? t("shell.splash.sso") : t("shell.splash.opening")}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="screen">
      <div className="splash-card">
        <WifiOff size={36} className="muted" />
        <h2>{offline ? t("shell.splash.offline") : t("shell.splash.slow", { app: app.name })}</h2>
        <p className="muted">
          {offline
            ? t("shell.splash.offlineBody")
            : t("shell.splash.slowBody", { host: new URL(app.origin).host })}
        </p>
        <div className="row center">
          <button className="btn primary" onClick={onRetry}><RotateCw size={16} /> {t("shell.common.retry")}</button>
          <button className="btn" onClick={() => native.openInBrowser()}><ExternalLink size={16} /> {t("shell.common.openInBrowser")}</button>
        </div>
      </div>
    </div>
  );
}
