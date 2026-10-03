import { ExternalLink, Globe, X } from "lucide-react";
import { native } from "../lib/native";

/**
 * Shown over the app area while signing in through the browser
 * (browser_signin.rs): first while the person is in their browser, then
 * while NGA MIS finishes signing in with the code it got back.
 */
export function SigninProgress({ phase }: { phase: "waiting" | "completing" }) {
  if (phase === "completing") {
    return (
      <div className="screen">
        <div className="splash-card">
          <div className="spinner-ring" aria-hidden="true" />
          <h2>Signing you in…</h2>
          <p className="muted">Google confirmed it's you. NGA MIS is finishing your sign-in.</p>
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
        <h2>Continue in your browser</h2>
        <p className="muted">
          Choose your Google account in the browser tab that just opened. NGA will sign you in as soon as you're done.
        </p>
        <div className="row center">
          <button className="btn" onClick={() => native.signinReopen()}>
            <ExternalLink size={16} /> Open the browser again
          </button>
          <button className="btn" onClick={() => native.signinCancel()}>
            <X size={16} /> Cancel
          </button>
        </div>
        <p className="muted small">This page closes on its own after you sign in.</p>
      </div>
    </div>
  );
}
