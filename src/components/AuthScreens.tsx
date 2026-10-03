import { LogIn } from "lucide-react";
import type { DesktopApp } from "../lib/native";

/** While NGA signs out of every app (Settings, or "Sign out" inside any app). */
export function SigningOutScreen() {
  return (
    <div className="screen">
      <div className="splash-card">
        <div className="spinner-ring" aria-hidden="true" />
        <h2>Signing you out…</h2>
        <p className="muted">Signing out of NGA MIS, Task Mentor, Tendo and Tupo.</p>
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
  return (
    <div className="screen" style={{ ["--app" as string]: app.color }}>
      <div className="splash-card">
        <img className="screen-icon" src={`/apps/${app.key}.png`} alt="" />
        <h2>Sign in to open {app.name}</h2>
        <p className="muted">
          You sign in once, in NGA MIS. {app.name} and the other apps then open signed in.
        </p>
        <div className="row center">
          <button className="btn primary" onClick={onSignIn}>
            <LogIn size={16} /> Sign in with NGA MIS
          </button>
        </div>
      </div>
    </div>
  );
}
