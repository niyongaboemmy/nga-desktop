import { useEffect, useState } from "react";
import { Download, LogOut, RefreshCw, Trash2 } from "lucide-react";
import type { Update } from "@tauri-apps/plugin-updater";
import { native, type AppKey, type ShellInfo } from "../lib/native";
import { readSettings, saveSetting, type Settings as Prefs } from "../lib/settings";
import { findUpdate, installUpdate } from "../lib/updater";

export function Settings({ info }: { info: ShellInfo }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [confirm, setConfirm] = useState<"signout" | "reset" | null>(null);
  const [working, setWorking] = useState(false);
  const [update, setUpdate] = useState<Update | null | "none" | "checking">(null);
  const [pct, setPct] = useState<number | null>(null);

  useEffect(() => void readSettings().then(setPrefs), []);

  const run = async (fn: () => Promise<void>) => {
    setWorking(true);
    try {
      await fn();
    } finally {
      setWorking(false);
      setConfirm(null);
    }
  };

  return (
    <div className="settings">
      <section>
        <h3>Start with</h3>
        <select
          value={prefs?.startApp ?? "last"}
          onChange={(e) => {
            const v = e.target.value as AppKey | "last";
            setPrefs((p) => (p ? { ...p, startApp: v } : p));
            void saveSetting("startApp", v);
          }}
        >
          <option value="last">The app I used last</option>
          {info.apps.map((a) => (
            <option key={a.key} value={a.key}>{a.name}</option>
          ))}
        </select>
      </section>

      <section>
        <h3>Account</h3>
        <p className="muted">
          You sign in once, in NGA MIS. Task Mentor, Tendo and Tupo then sign in through it. Signing out ends your
          session in every NGA app and removes your data from this computer. Always do this on a shared computer.
        </p>
        {confirm === "signout" ? (
          <div className="row">
            <button className="btn danger" disabled={working} onClick={() => run(native.signOut)}>
              <LogOut size={16} /> {working ? "Signing out…" : "Yes, sign out everywhere"}
            </button>
            <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        ) : (
          <button className="btn" onClick={() => setConfirm("signout")}><LogOut size={16} /> Sign out of this computer</button>
        )}
      </section>

      <section>
        <h3>Updates</h3>
        {!info.updater ? (
          <p className="muted">This build doesn't update itself (development or unsigned build).</p>
        ) : update && typeof update === "object" ? (
          <div className="row">
            <span>Version {update.version} is available.</span>
            <button className="btn primary" disabled={pct !== null} onClick={() => installUpdate(update, setPct)}>
              <Download size={16} /> {pct === null ? "Restart & update" : `Downloading ${pct}%`}
            </button>
          </div>
        ) : (
          <div className="row">
            <button
              className="btn"
              disabled={update === "checking"}
              onClick={async () => {
                setUpdate("checking");
                setUpdate((await findUpdate()) ?? "none");
              }}
            >
              <RefreshCw size={16} /> {update === "checking" ? "Checking…" : "Check for updates"}
            </button>
            {update === "none" && <span className="muted">You have the latest version.</span>}
          </div>
        )}
      </section>

      <section>
        <h3>Troubleshooting</h3>
        <p className="muted">If an app keeps showing an old page or won't sign in, reset NGA. This clears everything it saved.</p>
        {confirm === "reset" ? (
          <div className="row">
            <button className="btn danger" disabled={working} onClick={() => run(native.resetProfile)}>
              <Trash2 size={16} /> Yes, reset
            </button>
            <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        ) : (
          <div className="row">
            <button className="btn" onClick={() => setConfirm("reset")}><Trash2 size={16} /> Reset NGA</button>
            <button className="btn" onClick={() => native.showDownloads()}><Download size={16} /> Open Downloads folder</button>
          </div>
        )}
      </section>

      <section>
        <h3>About</h3>
        <dl className="about">
          <dt>NGA Desktop</dt><dd>{info.version}{info.env !== "production" ? ` (${info.env})` : ""}</dd>
          <dt>System</dt><dd>{info.os}</dd>
          <dt>Web engine</dt><dd>{info.webview || "unknown"}</dd>
          {info.apps.map((a) => (
            <div key={a.key} className="about-row"><dt>{a.name}</dt><dd>{a.origin}</dd></div>
          ))}
        </dl>
      </section>
    </div>
  );
}
