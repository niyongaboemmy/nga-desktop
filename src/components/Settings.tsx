import { useEffect, useState } from "react";
import { BellOff, BellRing, Download, ExternalLink, LogOut, Monitor, Moon, RefreshCw, Sun, Trash2 } from "lucide-react";
import { native, on, type AppKey, type OsPermission, type ShellInfo } from "../lib/native";
import { readSettings, saveSetting, type Settings as Prefs } from "../lib/settings";
import { checkNow, installNow, type UpdateState } from "../lib/updater";
import type { ThemePref } from "../lib/theme";
import { isMac } from "../lib/platform";

const THEMES: Array<{ id: ThemePref; label: string; icon: React.ReactNode }> = [
  { id: "mis", label: "My NGA account", icon: <img src="/apps/mis.png" alt="" /> },
  { id: "light", label: "Light", icon: <Sun size={16} /> },
  { id: "dark", label: "Dark", icon: <Moon size={16} /> },
  { id: "system", label: "This computer", icon: <Monitor size={16} /> },
];

const PERM_TEXT: Record<OsPermission, string> = {
  granted: "Allowed. NGA can show banners on this computer.",
  denied: "Blocked by this computer. Turn notifications on for NGA in System Settings.",
  prompt: "Not set up yet.",
  unknown: isMac
    ? "Run the installed app to manage this here."
    : "On, unless turned off in Windows Settings → System → Notifications.",
};

export function Settings({
  info,
  themePref,
  onTheme,
  update,
  setUpdate,
  updatePct,
  busyIn,
}: {
  info: ShellInfo;
  themePref: ThemePref;
  onTheme: (t: ThemePref) => void;
  /** Shared with the title bar's "Update" pill (App). */
  update: UpdateState;
  setUpdate: (u: UpdateState) => void;
  updatePct: number | null;
  /** An app holding a quiz or meeting: restarting now would end it. */
  busyIn: string | null;
}) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [perm, setPerm] = useState<OsPermission>("unknown");
  const [confirm, setConfirm] = useState<"signout" | "reset" | null>(null);
  const [working, setWorking] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => void readSettings().then(setPrefs);
    load();
    void native.osPermission().then(setPerm);
    const sub = on("nga://settings-changed", load);
    return () => void sub.then((off) => off());
  }, []);

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => (p ? { ...p, [key]: value } : p));
    void saveSetting(key, value);
  };
  const run = async (fn: () => Promise<void>) => {
    setWorking(true);
    try {
      await fn();
    } finally {
      setWorking(false);
      setConfirm(null);
    }
  };
  const dndOn = !!prefs && prefs.dndUntil > Date.now();
  const toggleMute = (key: AppKey) => {
    if (!prefs) return;
    set("mutedApps", prefs.mutedApps.includes(key) ? prefs.mutedApps.filter((k) => k !== key) : [...prefs.mutedApps, key]);
  };
  const tomorrow8 = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d.getTime();
  };

  return (
    <div className="settings">
      <section>
        <h3>Appearance</h3>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t.id} role="radio" aria-checked={themePref === t.id} className={themePref === t.id ? "on" : ""} onClick={() => onTheme(t.id)}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <p className="muted small">
          One theme everywhere: switching here also switches NGA MIS, Task Mentor, Tendo and Tupo (and saves it to your
          account), and switching in any of them switches NGA too.
        </p>
      </section>

      <section>
        <h3>Notifications</h3>
        <div className={`perm perm-${perm}`}>
          <BellRing size={18} />
          <span>
            <strong>On this computer</strong>
            <span className="muted">{PERM_TEXT[perm]}</span>
          </span>
          <div className="row tight">
            {perm === "prompt" && (
              <button className="btn primary sm" onClick={async () => setPerm(await native.osPermissionRequest())}>Allow</button>
            )}
            <button className="btn sm" onClick={() => native.osOpenSettings()}><ExternalLink size={14} /> System settings</button>
            <button className="btn sm" onClick={() => native.osTestBanner()}>Send a test</button>
          </div>
        </div>
        <div className="row">
          {dndOn ? (
            <>
              <span className="pill-warn">
                <BellOff size={14} /> Do Not Disturb until{" "}
                {new Date(prefs!.dndUntil).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
              <button className="btn sm" onClick={() => set("dndUntil", 0)}>Turn off</button>
            </>
          ) : (
            <>
              <span className="muted">Do Not Disturb:</span>
              <button className="btn sm" onClick={() => set("dndUntil", Date.now() + 3_600_000)}>1 hour</button>
              <button className="btn sm" onClick={() => set("dndUntil", tomorrow8())}>Until tomorrow 08:00</button>
            </>
          )}
        </div>
        <p className="muted small">
          Banners also wait on their own while you're in a Tupo meeting or taking a Task Mentor quiz. Everything still
          collects under the bell.
        </p>
        <div className="mute-grid">
          {info.apps.map((a) => (
            <label key={a.key} className="switch-row">
              <img src={`/apps/${a.key}.png`} alt="" />
              <span>{a.name}</span>
              <input type="checkbox" className="switch" checked={!prefs?.mutedApps.includes(a.key)} onChange={() => toggleMute(a.key)} />
            </label>
          ))}
        </div>
      </section>

      <section>
        <h3>General</h3>
        <label className="switch-row wide">
          <span>
            <strong>Sign in to every app in the background</strong>
            <span className="muted">After you sign in to NGA MIS, the other apps sign in too, so they open at once and can notify you.</span>
          </span>
          <input type="checkbox" className="switch" checked={prefs?.backgroundSignIn ?? true} onChange={(e) => set("backgroundSignIn", e.target.checked)} />
        </label>
        <label className="switch-row wide">
          <span>
            <strong>Keep NGA running when its window is closed</strong>
            <span className="muted">Notifications keep arriving. Quit from the {isMac ? "menu bar" : "tray"} icon.</span>
          </span>
          <input type="checkbox" className="switch" checked={prefs?.keepRunning ?? true} onChange={(e) => set("keepRunning", e.target.checked)} />
        </label>
        <label className="switch-row wide">
          <span>
            <strong>Start with</strong>
          </span>
          <select value={prefs?.startApp ?? "last"} onChange={(e) => set("startApp", e.target.value as AppKey | "last")}>
            <option value="last">The app I used last</option>
            {info.apps.map((a) => (
              <option key={a.key} value={a.key}>{a.name}</option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h3>Account</h3>
        <p className="muted">
          You sign in once, in NGA MIS, and the other apps follow. Signing out ends your session in every NGA app and
          removes your data from this computer. Always do it on a shared computer.
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
        ) : update.kind === "available" ? (
          <div className="update-card">
            <div className="row">
              <span>
                <strong>NGA {update.info.version}</strong> is ready <span className="muted">(you have {update.info.current})</span>
              </span>
              <button
                className="btn primary"
                disabled={updatePct !== null || !!busyIn}
                onClick={() => {
                  setInstallError(null);
                  installNow().catch((e) => setInstallError(String(e)));
                }}
              >
                <Download size={16} /> {updatePct === null ? "Restart & update" : `Downloading ${updatePct}%`}
              </button>
            </div>
            {busyIn && <p className="muted">Finish the {busyIn} first: updating restarts NGA.</p>}
            {update.info.notes && <p className="notes">{update.info.notes}</p>}
            {installError && <p className="error">Couldn't update: {installError}</p>}
          </div>
        ) : (
          <div className="row">
            <button
              className="btn"
              disabled={update.kind === "checking"}
              onClick={async () => {
                setUpdate({ kind: "checking" });
                setUpdate(await checkNow());
              }}
            >
              <RefreshCw size={16} className={update.kind === "checking" ? "spin" : ""} />{" "}
              {update.kind === "checking" ? "Checking…" : "Check for updates"}
            </button>
            {update.kind === "current" && <span className="muted">You have the latest version ({info.version}).</span>}
            {update.kind === "error" && <span className="muted">Couldn't reach the update service. Try again later.</span>}
          </div>
        )}
      </section>

      <section>
        <h3>Troubleshooting</h3>
        <p className="muted">If an app keeps showing an old page or won't sign in, reset NGA. This clears everything it saved.</p>
        {confirm === "reset" ? (
          <div className="row">
            <button className="btn danger" disabled={working} onClick={() => run(native.resetProfile)}><Trash2 size={16} /> Yes, reset</button>
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
