import { useEffect, useState, type CSSProperties } from "react";
import { BellOff, BellRing, Download, ExternalLink, LoaderCircle, LogOut, Monitor, Moon, RefreshCw, Sun, Trash2 } from "lucide-react";
import { native, on, type AppKey, type OsPermission, type ShellInfo } from "../lib/native";
import { readSettings, saveSetting, type Settings as Prefs } from "../lib/settings";
import { checkNow, installNow, type UpdateState } from "../lib/updater";
import type { ThemePref } from "../lib/theme";
import { isMac, mod } from "../lib/platform";
import { LANGS, useLang, type Key, type LangPref } from "../tools/i18n";
import { toolsNative } from "../tools/shared/native";

const THEMES: Array<{ id: ThemePref; label: Key; icon: React.ReactNode }> = [
  { id: "mis", label: "shell.theme.mis", icon: <img src="/apps/mis.png" alt="" /> },
  { id: "light", label: "shell.theme.light", icon: <Sun size={16} /> },
  { id: "dark", label: "shell.theme.dark", icon: <Moon size={16} /> },
  { id: "system", label: "shell.theme.system", icon: <Monitor size={16} /> },
];

const PERM_TEXT: Record<OsPermission, Key> = {
  granted: "shell.perm.granted",
  denied: "shell.perm.denied",
  prompt: "shell.perm.prompt",
  unknown: isMac ? "shell.perm.unknownMac" : "shell.perm.unknownWin",
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
  /** The name of an app holding a quiz or meeting: restarting now would end it. */
  busyIn: string | null;
}) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [perm, setPerm] = useState<OsPermission>("unknown");
  const [confirm, setConfirm] = useState<"signout" | "reset" | null>(null);
  const [working, setWorking] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [autostart, setAutostart] = useState(false);
  const [autostartError, setAutostartError] = useState<string | null>(null);
  const toggleAutostart = (on: boolean) => {
    setAutostartError(null);
    setAutostart(on);
    native.autostartSet(on).catch((e) => {
      setAutostart(!on);
      setAutostartError(String(e));
    });
  };
  const tools = useLang();
  const { t } = tools;
  const place = t(isMac ? "shell.settings.menuBar" : "shell.settings.tray");
  const setShortcut = (on: boolean) => {
    setShortcutError(null);
    setPrefs((p) => (p ? { ...p, toolsShortcut: on } : p));
    toolsNative.setShortcut(on).catch((e) => {
      setPrefs((p) => (p ? { ...p, toolsShortcut: false } : p));
      setShortcutError(String(e));
    });
  };

  useEffect(() => {
    const load = () => void readSettings().then(setPrefs);
    load();
    void native.osPermission().then(setPerm);
    void native.updateAutoGet().then((v) => setAutoUpdate(v ?? true), () => {});
    void native.autostartGet().then((v) => setAutostart(!!v), () => {});
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
        <h3>{t("shell.appearance")}</h3>
        <div className="segmented" role="radiogroup" aria-label={t("shell.theme.label")}>
          {THEMES.map((th) => (
            <button key={th.id} role="radio" aria-checked={themePref === th.id} className={themePref === th.id ? "on" : ""} onClick={() => onTheme(th.id)}>
              {th.icon}
              <span>{t(th.label)}</span>
            </button>
          ))}
        </div>
        <p className="muted small">{t("shell.theme.note")}</p>
      </section>

      <section>
        <h3>{t("shell.notices.title")}</h3>
        <div className={`perm perm-${perm}`}>
          <BellRing size={18} />
          <span>
            <strong>{t("shell.settings.onThisComputer")}</strong>
            <span className="muted">{t(PERM_TEXT[perm])}</span>
          </span>
          <div className="row tight">
            {perm === "prompt" && (
              <button className="btn primary sm" onClick={async () => setPerm(await native.osPermissionRequest())}>{t("shell.common.allow")}</button>
            )}
            <button className="btn sm" onClick={() => native.osOpenSettings()}><ExternalLink size={14} /> {t("shell.settings.systemSettings")}</button>
            <button className="btn sm" onClick={() => native.osTestBanner()}>{t("shell.settings.sendTest")}</button>
          </div>
        </div>
        <div className="row">
          {dndOn ? (
            <>
              <span className="pill-warn">
                <BellOff size={14} />{" "}
                {t("shell.settings.dndUntil", {
                  when: new Date(prefs!.dndUntil).toLocaleString(tools.lang, { weekday: "short", hour: "2-digit", minute: "2-digit" }),
                })}
              </span>
              <button className="btn sm" onClick={() => set("dndUntil", 0)}>{t("shell.settings.turnOff")}</button>
            </>
          ) : (
            <>
              <span className="muted">{t("shell.settings.dnd")}</span>
              <button className="btn sm" onClick={() => set("dndUntil", Date.now() + 3_600_000)}>{t("shell.settings.oneHour")}</button>
              <button className="btn sm" onClick={() => set("dndUntil", tomorrow8())}>{t("shell.settings.untilTomorrow")}</button>
            </>
          )}
        </div>
        <p className="muted small">{t("shell.settings.bannersWait")}</p>
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
        <h3>{t("shell.settings.general")}</h3>
        <label className="switch-row wide">
          <span>
            <strong>{t("settings.language")}</strong>
          </span>
          <select value={tools.pref} onChange={(e) => tools.setPref(e.target.value as LangPref)}>
            <option value="auto">{t("settings.languageAuto")}</option>
            {LANGS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="switch-row wide">
          <span>
            <strong>{t("shell.settings.bgSignIn")}</strong>
            <span className="muted">{t("shell.settings.bgSignInHint")}</span>
          </span>
          <input type="checkbox" className="switch" checked={prefs?.backgroundSignIn ?? true} onChange={(e) => set("backgroundSignIn", e.target.checked)} />
        </label>
        <label className="switch-row wide">
          <span>
            <strong>{t("shell.settings.autostart")}</strong>
            <span className="muted">{t("shell.settings.autostartHint", { place })}</span>
            {autostartError && <span className="field-error">{autostartError}</span>}
          </span>
          <input type="checkbox" className="switch" checked={autostart} onChange={(e) => toggleAutostart(e.target.checked)} />
        </label>
        <label className="switch-row wide">
          <span>
            <strong>{t("shell.settings.keepRunning")}</strong>
            <span className="muted">{t("shell.settings.keepRunningHint", { place })}</span>
          </span>
          <input type="checkbox" className="switch" checked={prefs?.keepRunning ?? true} onChange={(e) => set("keepRunning", e.target.checked)} />
        </label>
        <label className="switch-row wide">
          <span>
            <strong>{t("shell.settings.startWith")}</strong>
          </span>
          <select value={prefs?.startApp ?? "last"} onChange={(e) => set("startApp", e.target.value as AppKey | "last")}>
            <option value="last">{t("shell.settings.startLast")}</option>
            {info.apps.map((a) => (
              <option key={a.key} value={a.key}>{a.name}</option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h3>{t("settings.tools")}</h3>
        <label className="switch-row wide">
          <span>
            <strong>{t("settings.shortcut")}</strong>
            <span className="muted">{t("settings.shortcutHint", { key: `${mod}⇧Space` })}</span>
            {shortcutError && <span className="field-error">{shortcutError}</span>}
          </span>
          <input type="checkbox" className="switch" checked={prefs?.toolsShortcut ?? false} onChange={(e) => setShortcut(e.target.checked)} />
        </label>
        <p className="muted">{t("settings.dataHint")}</p>
      </section>

      <section>
        <h3>{t("shell.settings.account")}</h3>
        <p className="muted">{t("shell.settings.accountNote")}</p>
        {confirm === "signout" ? (
          <div className="row">
            <button className="btn danger" disabled={working} onClick={() => run(native.signOut)}>
              <LogOut size={16} /> {working ? t("shell.settings.signingOut") : t("shell.settings.confirmSignOut")}
            </button>
            <button className="btn" onClick={() => setConfirm(null)}>{t("shell.common.cancel")}</button>
          </div>
        ) : (
          <button className="btn" onClick={() => setConfirm("signout")}><LogOut size={16} /> {t("shell.action.signout")}</button>
        )}
        <label className="switch-row wide">
          <span>
            <strong>{t("shell.settings.wipe")}</strong>
            <span className="muted">{t("shell.settings.wipeHint")}</span>
          </span>
          <input type="checkbox" className="switch" checked={prefs?.wipeOnSignOut ?? false} onChange={(e) => set("wipeOnSignOut", e.target.checked)} />
        </label>
      </section>

      <section>
        <h3>{t("shell.settings.updates")}</h3>
        {info.updater && (
          <label className="switch-row wide">
            <span>
              <strong>{t("shell.settings.autoUpdate")}</strong>
              <span className="muted">{t("shell.settings.autoUpdateHint")}</span>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={autoUpdate}
              onChange={(e) => {
                setAutoUpdate(e.target.checked);
                void native.updateAutoSet(e.target.checked);
              }}
            />
          </label>
        )}
        {!info.updater ? (
          <p className="muted">{t("shell.settings.noUpdater")}</p>
        ) : update.kind === "available" ? (
          <div className="update-card">
            <div className="row">
              <span>
                <strong>NGA {update.info.version}</strong> {t("shell.settings.isReady")}{" "}
                <span className="muted">{t("shell.settings.youHave", { version: update.info.current })}</span>
              </span>
              <button
                className={`btn primary update-btn${updatePct !== null ? " updating" : ""}`}
                disabled={updatePct !== null || !!busyIn}
                style={updatePct === null ? undefined : ({ "--pct": `${updatePct}%` } as CSSProperties)}
                onClick={() => {
                  setInstallError(null);
                  installNow().catch((e) => setInstallError(String(e)));
                }}
              >
                {updatePct !== null && <span className="update-progress" />}
                {updatePct === null ? <Download size={16} /> : <LoaderCircle size={16} className="spin" />}
                <span>{updatePct === null ? t("shell.settings.restartUpdate") : t("shell.settings.downloading", { pct: updatePct })}</span>
              </button>
            </div>
            {busyIn && <p className="muted">{t("shell.settings.busy", { app: busyIn })}</p>}
            {update.info.notes && <p className="notes">{update.info.notes}</p>}
            {installError && <p className="error">{t("shell.settings.couldntUpdate", { error: installError })}</p>}
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
              {update.kind === "checking" ? t("shell.settings.checking") : t("shell.settings.check")}
            </button>
            {update.kind === "current" && <span className="muted">{t("shell.settings.latest", { version: info.version })}</span>}
            {update.kind === "error" && <span className="muted">{t("shell.settings.unreachable")}</span>}
          </div>
        )}
      </section>

      <section>
        <h3>{t("shell.settings.troubleshooting")}</h3>
        <p className="muted">{t("shell.settings.troubleNote")}</p>
        {confirm === "reset" ? (
          <div className="row">
            <button className="btn danger" disabled={working} onClick={() => run(native.resetProfile)}><Trash2 size={16} /> {t("shell.settings.confirmReset")}</button>
            <button className="btn" onClick={() => setConfirm(null)}>{t("shell.common.cancel")}</button>
          </div>
        ) : (
          <div className="row">
            <button className="btn" onClick={() => setConfirm("reset")}><Trash2 size={16} /> {t("shell.settings.reset")}</button>
            <button className="btn" onClick={() => native.showDownloads()}><Download size={16} /> {t("shell.settings.openDownloads")}</button>
          </div>
        )}
      </section>

      <section>
        <h3>{t("shell.settings.about")}</h3>
        <dl className="about">
          <dt>NGA Desktop</dt><dd>{info.version}{info.env !== "production" ? ` (${info.env})` : ""}</dd>
          <dt>{t("shell.settings.system")}</dt><dd>{info.os}</dd>
          <dt>{t("shell.settings.webEngine")}</dt><dd>{info.webview || t("shell.settings.unknown")}</dd>
          {info.apps.map((a) => (
            <div key={a.key} className="about-row"><dt>{a.name}</dt><dd>{a.origin}</dd></div>
          ))}
        </dl>
      </section>
    </div>
  );
}
