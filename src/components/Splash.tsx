import { ExternalLink, RotateCw, WifiOff } from "lucide-react";
import { native, type DesktopApp } from "../lib/native";

/** Shown in the app area until the app's first page has loaded. */
export function Splash({ app, slow, onRetry }: { app: DesktopApp; slow: boolean; onRetry: () => void }) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  if (!slow && !offline) {
    return (
      <div className="screen">
        <img className="screen-icon pulse" src={`/apps/${app.key}.png`} alt="" />
        <p className="muted">Opening {app.name}…</p>
        {app.sso && <p className="hint">Signing you in with NGA MIS</p>}
      </div>
    );
  }
  return (
    <div className="screen">
      <WifiOff size={40} className="muted" />
      <h2>{offline ? "You're offline" : `${app.name} is taking a while`}</h2>
      <p className="muted">
        {offline
          ? "Check the Wi-Fi or network cable, then try again."
          : `We couldn't reach ${new URL(app.origin).host} yet. The school network or the server may be slow.`}
      </p>
      <div className="row">
        <button className="btn primary" onClick={onRetry}><RotateCw size={16} /> Try again</button>
        <button className="btn" onClick={() => native.openInBrowser()}><ExternalLink size={16} /> Open in browser</button>
      </div>
    </div>
  );
}
