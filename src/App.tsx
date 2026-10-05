import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { AlarmClock, ArrowDownCircle, Bell, Download, X } from "lucide-react";
import { TitleBar, FocusBar, type Page } from "./components/TitleBar";
import { Splash } from "./components/Splash";
import { Settings } from "./components/Settings";
import { NoticePanel } from "./components/NoticePanel";
import { Onboarding } from "./components/Onboarding";
import { SigninProgress } from "./components/SigninProgress";
import { SignedOutScreen, SigningOutScreen } from "./components/AuthScreens";
import { native, on, type AppKey, type Notice, type NoticeSummary, type ShellInfo } from "./lib/native";
import { isSlow, reduce } from "./lib/appState";
import { readSettings, saveSetting, type RecentPage } from "./lib/settings";
import type { UpdateState } from "./lib/updater";
import { applyTheme, resolveTheme, systemPrefersDark, type Theme, type ThemePref } from "./lib/theme";
import { addRecent } from "./lib/palette";
import { useIdentity } from "./tools/shared/identity";
import { onTool } from "./tools/shared/native";
import { chime } from "./tools/shared/sound";
import { useLang } from "./tools/i18n";
import { findTool } from "./tools/registry";

/** Below this width the tabs show icons only, so the app keeps its room. */
export const COMPACT_BELOW = 1100;

type Toast =
  | { kind: "download"; text: string; path: string | null }
  | { kind: "notice"; notice: Notice }
  | { kind: "info"; text: string }
  | { kind: "update"; version: string }
  | { kind: "alert"; title: string; body: string }
  | null;

type PanelKind = false | "notices";

export default function App() {
  const [info, setInfo] = useState<ShellInfo | null>(null);
  const [active, setActive] = useState<AppKey | null>(null);
  const [page, setPage] = useState<Page>("app");
  const [panel, setPanel] = useState<PanelKind>(false);
  const [timersRunning, setTimersRunning] = useState(0);
  // Who is signed in, kept warm for the tools (the modal itself lives in the overlay window).
  useIdentity();
  const { t } = useLang();
  const [focus, setFocus] = useState(false);
  const [views, dispatch] = useReducer(reduce, {});
  const [notices, setNotices] = useState<NoticeSummary | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [now, setNow] = useState(Date.now());
  const [compact, setCompact] = useState(window.innerWidth < COMPACT_BELOW);
  const [themePref, setThemePref] = useState<ThemePref>("mis");
  const [misTheme, setMisTheme] = useState<Theme | undefined>();
  const [systemDark, setSystemDark] = useState(systemPrefersDark());
  const [onboarded, setOnboarded] = useState(true);
  // Recent pages are recorded here and read by the palette (overlay window).
  const [, setRecent] = useState<RecentPage[]>([]);
  const [focusSession, setFocusSession] = useState<AppKey | null>(null);
  const [update, setUpdate] = useState<UpdateState>({ kind: "idle" });
  const [updatePct, setUpdatePct] = useState<number | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [signin, setSignin] = useState<"waiting" | "completing" | "idle">("idle");
  const [signingOut, setSigningOut] = useState(false);
  // The NGA MIS session: null until known. While false, the other apps' tabs
  // show "Sign in with NGA MIS" instead of a sign-in form of their own.
  const [misSignedIn, setMisSignedIn] = useState<boolean | null>(null);
  const misSignedInRef = useRef<boolean | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const lastUrl = useRef<Partial<Record<AppKey, string>>>({});

  const theme = resolveTheme(themePref, misTheme, systemDark);
  // True while the change being applied was picked by the person in the shell
  // (theme.rs then has MIS save it to their account); false when following an app.
  const userPicked = useRef(false);
  useEffect(() => {
    applyTheme(theme);
    void native.setWindowTheme(theme, userPicked.current);
    userPicked.current = false;
  }, [theme]);

  const chooseTheme = useCallback((t: ThemePref) => {
    userPicked.current = true;
    setThemePref(t);
    void saveSetting("theme", t);
  }, []);

  const open = useCallback((key: AppKey) => {
    setPage("app");
    setActive(key);
    void saveSetting("lastApp", key);
    // Signed out: no sign-in form inside this app's tab (see SignedOutScreen).
    if (key !== "mis" && misSignedInRef.current === false) return;
    dispatch({ type: "opened", key, at: Date.now() });
    void native.openApp(key);
  }, []);

  // Native self-test of the tools, only in builds made with VITE_NGA_SELFTEST=1
  // (release builds never set it, so Vite removes this code from them).
  useEffect(() => {
    if (import.meta.env.VITE_NGA_SELFTEST === "1")
      void import("./tools/selftest").then((m) => m.runShellSelftest());
  }, []);

  // Start-up: registry and preferences, then the preferred app.
  useEffect(() => {
    void (async () => {
      const shellInfo = await native.shellInfo();
      const prefs = await readSettings();
      setThemePref(prefs.theme);
      setMisTheme(prefs.misTheme);
      setOnboarded(prefs.onboarded);
      setRecent(prefs.recent);
      setInfo(shellInfo);
      setNotices(await native.noticeSummary());
      setFocusSession(await native.focusSession());
      const keys = shellInfo.apps.map((a) => a.key);
      const wanted = prefs.startApp === "last" ? prefs.lastApp : prefs.startApp;
      open(wanted && keys.includes(wanted) ? wanted : "mis");
    })();
  }, [open]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    const onResize = () => setCompact(window.innerWidth < COMPACT_BELOW);
    window.addEventListener("resize", onResize);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const remember = useCallback((key: AppKey, title?: string) => {
    const url = lastUrl.current[key];
    if (!url || !title) return;
    try {
      const u = new URL(url);
      setRecent((list) => {
        const next = addRecent(list, { key, path: u.pathname + u.search, title, at: Date.now() });
        if (next !== list) void saveSetting("recent", next);
        return next;
      });
    } catch {
      /* not a URL */
    }
  }, []);

  // Events from the native side.
  useEffect(() => {
    const subs = [
      on("nga://active", ({ key }) => {
        setPage("app");
        setActive(key);
        dispatch({ type: "opened", key, at: Date.now() });
        void saveSetting("lastApp", key);
      }),
      on("nga://loading", ({ key, url }) => dispatch({ type: "loading", key, url })),
      on("nga://syncing", (key) => dispatch({ type: "syncing", key, at: Date.now() })),
      on("nga://loaded", ({ key, url }) => {
        dispatch({ type: "loaded", key, url });
        if (url) lastUrl.current[key] = url;
      }),
      on("nga://title", ({ key, title }) => {
        dispatch({ type: "title", key, title });
        remember(key, title);
      }),
      on("nga://download", ({ success, path }) =>
        setToast({ kind: "download", text: success ? `Downloaded ${path?.split(/[\\/]/).pop() ?? "a file"}` : "Download failed", path }),
      ),
      on("nga://notices", setNotices),
      on("nga://notice", (notice) => setToast({ kind: "notice", notice })),
      on("nga://toast", (text) => setToast({ kind: "info", text })),
      // A newer NGA (updates.rs checks after start and every few hours).
      on("nga://update", ({ info, announce }) => {
        setUpdate({ kind: "available", info });
        if (announce) setToast({ kind: "update", version: info.version });
      }),
      on("nga://update-progress", setUpdatePct),
      on("nga://signin", (phase) => {
        setSignin(phase);
        if (phase !== "idle") {
          setPage("app");
          setPanel(false);
        }
      }),
      // A timer rang (tools/timers.rs): chime, and a toast when NGA is in front.
      onTool("nga://tool-alert", ({ title, body }) => {
        chime();
        setToast({ kind: "alert", title, body });
      }),
      onTool("nga://timers", (list) => setTimersRunning(list.filter((x) => x.runningSince !== null).length)),
      // Switched inside an app: everything follows the account's theme.
      on("nga://app-theme", (t) => {
        setMisTheme(t);
        setThemePref("mis");
        void saveSetting("theme", "mis");
      }),
      on("nga://focus-session", setFocusSession),
      on("nga://closed", (keys) => {
        dispatch({ type: "closed", keys });
        setActive((a) => (a && keys.includes(a) ? null : a));
      }),
      on("nga://auth", (signedIn) => {
        misSignedInRef.current = signedIn;
        setMisSignedIn(signedIn);
        if (signedIn) {
          // Signed in: an app tab that was waiting opens now (it syncs behind its loading screen).
          setActive((a) => {
            if (a && a !== "mis") {
              dispatch({ type: "opened", key: a, at: Date.now() });
              void native.openApp(a);
            }
            return a;
          });
        } else {
          dispatch({ type: "closed", keys: ["taskmentor", "tendo", "tupo"] });
          setActive((a) => (a === null ? (open("mis"), "mis") : a));
        }
      }),
      on("nga://signout", (phase) => {
        setSigningOut(phase === "start");
        if (phase === "done") {
          setPage("app");
          open("mis");
        }
      }),
      on("nga://menu", (id) => {
        if (id === "focus") setFocus((f) => !f);
        else if (id === "reload") void native.reload();
        else if (id === "print") void native.print();
        else if (id === "signout") { setFocus(false); setPage("settings"); }
        else if (id === "notices") { setFocus(false); setPanel((p) => (p === "notices" ? false : "notices")); }
        else if (id === "tools") void native.overlayShow("tools");
        else if (id.startsWith("tool:") && findTool(id.slice(5))) void native.overlayShow(id as `tool:${string}`);
        else if (id === "settings") { setFocus(false); setPage("settings"); }
        else if (id === "theme") {
          userPicked.current = true;
          setThemePref((p) => {
            const next: ThemePref = resolveTheme(p, misTheme, systemDark) === "dark" ? "light" : "dark";
            void saveSetting("theme", next);
            return next;
          });
        }
        else if (id.startsWith("theme:")) chooseTheme(id.slice(6) as ThemePref);
      }),
      on("nga://signed-out", () => {
        dispatch({ type: "reset" });
        setActive(null);
        open("mis");
      }),
    ];
    return () => subs.forEach((p) => void p.then((off) => off()));
  }, [open, remember, chooseTheme, misTheme, systemDark]);

  // Tell Rust exactly where the app area is (all four sides), whenever the layout moves.
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      void native.setInsets(r.left, r.top, Math.max(0, window.innerWidth - r.right), Math.max(0, window.innerHeight - r.bottom));
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener("resize", report);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", report);
    };
  }, [info, focus, panel, onboarded]);

  // Settings and the sign-in progress screen cover the app area (native app
  // views draw above this page).
  const waitingForSignIn = misSignedIn === false && !!active && active !== "mis";
  useEffect(
    () => void native.setCovered(page !== "app" || signin !== "idle" || signingOut || waitingForSignIn),
    [page, signin, signingOut, waitingForSignIn],
  );

  const view = active ? views[active] : undefined;

  // Back online: an app that never finished loading tries again on its own.
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) {
      setToast({ kind: "info", text: "You're back online" });
      if (active && views[active]?.status !== "ready") {
        dispatch({ type: "retry", key: active, at: Date.now() });
        void native.reload();
      }
    }
    wasOnline.current = online;
  }, [online, active, views]);
  const starting = page === "app" && view?.status === "starting";
  useEffect(() => {
    if (!starting) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [starting]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(
      () => setToast(null),
      toast.kind === "notice" ? 6000 : toast.kind === "update" || toast.kind === "alert" ? 15000 : 7000,
    );
    return () => window.clearTimeout(timer);
  }, [toast]);



  if (!info) return <div className="boot" />;
  const app = info.apps.find((a) => a.key === active) ?? null;

  const content =
    signingOut ? (
      <SigningOutScreen />
    ) : signin !== "idle" ? (
      <SigninProgress phase={signin} />
    ) : page === "settings" ? (
      <Settings
        info={info}
        themePref={themePref}
        onTheme={chooseTheme}
        update={update}
        setUpdate={setUpdate}
        updatePct={updatePct}
        busyIn={focusSession ? `${info.apps.find((a) => a.key === focusSession)?.name ?? "app"} quiz or meeting` : null}
      />
    ) : app && waitingForSignIn ? (
      <SignedOutScreen app={app} onSignIn={() => open("mis")} />
    ) : app && view?.status !== "ready" ? (
      <Splash
        app={app}
        slow={isSlow(view, now)}
        onRetry={() => {
          dispatch({ type: "retry", key: app.key, at: Date.now() });
          void native.reload();
        }}
      />
    ) : null;

  return (
    <div className="shell">
      {focus ? (
        <FocusBar app={app} onExit={() => setFocus(false)} />
      ) : (
        <TitleBar
          apps={info.apps}
          active={active}
          page={page}
          views={views}
          notices={notices}
          compact={compact}
          theme={theme}
          themePref={themePref}
          focusSession={focusSession}
          updateVersion={update.kind === "available" ? update.info.version : null}
          updatePct={updatePct}
          onUpdate={() => {
            // One click: download, install, restart. During a quiz or meeting
            // (restarting would end it) or if it fails, Settings explains.
            if (focusSession) return setPage("settings");
            setUpdatePct(0);
            native.updateInstall().catch(() => {
              setUpdatePct(null);
              setPage("settings");
            });
          }}
          online={online}
          panelOpen={panel === "notices"}
          toolsOpen={false}
          toolsLabel={t("panel.title")}
          toolsHint={t("tooltip.tools")}
          timersRunning={timersRunning}
          onTools={() => void native.overlayShow("tools")}
          onOpen={open}
          onPalette={() => void native.overlayShow("palette")}
          onShortcuts={() => void native.overlayShow("shortcuts")}
          onPanel={() => setPanel((p) => (p === "notices" ? false : "notices"))}
          onSettings={() => setPage(page === "settings" ? "app" : "settings")}
        />
      )}
      {!focus && !onboarded && (
        <Onboarding
          onDone={() => {
            setOnboarded(true);
            void saveSetting("onboarded", true);
          }}
        />
      )}
      <div className="body">
        <div className="viewport" ref={viewport}>
          <div
            key={signingOut ? "signout" : signin !== "idle" ? `signin-${signin}` : page === "settings" ? "settings" : `${active ?? "none"}-${waitingForSignIn}`}
            className="page-anim"
          >
            {content}
          </div>
        </div>
        {panel === "notices" && !focus && <NoticePanel apps={info.apps} onClose={() => setPanel(false)} />}
      </div>
      {toast && (toast.kind === "alert" || (!focus && (toast.kind === "download" || panel !== "notices"))) && (
        <div className="toast" role="status">
          {toast.kind === "info" ? (
            <span>{toast.text}</span>
          ) : toast.kind === "alert" ? (
            <button className="toast-notice" onClick={() => { void native.overlayShow("tool:timer"); setToast(null); }}>
              <AlarmClock size={15} />
              <span><strong>{toast.title}</strong>{toast.body ? ` · ${toast.body}` : ""}</span>
            </button>
          ) : toast.kind === "update" ? (
            <>
              <ArrowDownCircle size={15} />
              <span>NGA {toast.version} is available</span>
              <button className="link" onClick={() => { setPage("settings"); setToast(null); }}>Update…</button>
            </>
          ) : toast.kind === "download" ? (
            <>
              <Download size={15} />
              <span>{toast.text}</span>
              <button className="link" onClick={() => native.showDownloads(toast.path)}>Show</button>
            </>
          ) : (
            <button className="toast-notice" onClick={() => { void native.openNotice(toast.notice.id); setToast(null); }}>
              <img src={`/apps/${toast.notice.app}.png`} alt="" />
              <span><strong>{toast.notice.title}</strong>{toast.notice.body ? ` · ${toast.notice.body}` : ""}</span>
              <Bell size={14} />
            </button>
          )}
          <button className="icon" onClick={() => setToast(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}
