import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { Bell, Download, X } from "lucide-react";
import { TitleBar, FocusBar, type Page } from "./components/TitleBar";
import { Splash } from "./components/Splash";
import { Settings } from "./components/Settings";
import { NoticePanel } from "./components/NoticePanel";
import { Onboarding } from "./components/Onboarding";
import { SigninProgress } from "./components/SigninProgress";
import { native, on, type AppKey, type Notice, type NoticeSummary, type ShellInfo } from "./lib/native";
import { isSlow, reduce } from "./lib/appState";
import { readSettings, saveSetting, type RecentPage } from "./lib/settings";
import { applyTheme, resolveTheme, systemPrefersDark, type Theme, type ThemePref } from "./lib/theme";
import { addRecent } from "./lib/palette";

/** Below this width the tabs show icons only, so the app keeps its room. */
export const COMPACT_BELOW = 1100;

type Toast =
  | { kind: "download"; text: string; path: string | null }
  | { kind: "notice"; notice: Notice }
  | { kind: "info"; text: string }
  | null;

export default function App() {
  const [info, setInfo] = useState<ShellInfo | null>(null);
  const [active, setActive] = useState<AppKey | null>(null);
  const [page, setPage] = useState<Page>("app");
  const [panel, setPanel] = useState(false);
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
  const [online, setOnline] = useState(navigator.onLine);
  const [signin, setSignin] = useState<"waiting" | "completing" | "idle">("idle");
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
    dispatch({ type: "opened", key, at: Date.now() });
    void saveSetting("lastApp", key);
    void native.openApp(key);
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
      on("nga://signin", (phase) => {
        setSignin(phase);
        if (phase !== "idle") {
          setPage("app");
          setPanel(false);
        }
      }),
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
        if (!signedIn) setActive((a) => (a === null ? (open("mis"), "mis") : a));
      }),
      on("nga://menu", (id) => {
        if (id === "focus") setFocus((f) => !f);
        else if (id === "reload") void native.reload();
        else if (id === "print") void native.print();
        else if (id === "signout") { setFocus(false); setPage("settings"); }
        else if (id === "notices") { setFocus(false); setPanel((p) => !p); }
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
  useEffect(() => void native.setCovered(page !== "app" || signin !== "idle"), [page, signin]);

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
    const t = window.setTimeout(() => setToast(null), toast.kind === "notice" ? 6000 : 7000);
    return () => window.clearTimeout(t);
  }, [toast]);



  if (!info) return <div className="boot" />;
  const app = info.apps.find((a) => a.key === active) ?? null;

  const content =
    signin !== "idle" ? (
      <SigninProgress phase={signin} />
    ) : page === "settings" ? (
      <Settings info={info} themePref={themePref} onTheme={chooseTheme} />
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
          online={online}
          panelOpen={panel}
          onOpen={open}
          onPalette={() => void native.overlayShow("palette")}
          onShortcuts={() => void native.overlayShow("shortcuts")}
          onPanel={() => setPanel((p) => !p)}
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
          <div key={signin !== "idle" ? `signin-${signin}` : page === "settings" ? "settings" : active ?? "none"} className="page-anim">{content}</div>
        </div>
        {panel && !focus && <NoticePanel apps={info.apps} onClose={() => setPanel(false)} />}
      </div>
      {toast && !focus && (toast.kind === "download" || !panel) && (
        <div className="toast" role="status">
          {toast.kind === "info" ? (
            <span>{toast.text}</span>
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
