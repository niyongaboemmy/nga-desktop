import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { Splash } from "./components/Splash";
import { Settings } from "./components/Settings";
import { native, on, type AppKey, type ShellInfo } from "./lib/native";
import { isSlow, reduce } from "./lib/appState";
import { readSettings, saveSetting } from "./lib/settings";

type Toast = { text: string; path: string | null } | null;

export default function App() {
  const [info, setInfo] = useState<ShellInfo | null>(null);
  const [active, setActive] = useState<AppKey | null>(null);
  const [page, setPage] = useState<"app" | "settings">("app");
  const [collapsed, setCollapsed] = useState(false);
  const [views, dispatch] = useReducer(reduce, {});
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<Toast>(null);
  const viewport = useRef<HTMLDivElement>(null);

  const open = useCallback((key: AppKey) => {
    setPage("app");
    setActive(key);
    dispatch({ type: "opened", key, at: Date.now() });
    void saveSetting("lastApp", key);
    void native.openApp(key);
  }, []);

  // Start: registry from Rust, then the preferred app.
  useEffect(() => {
    void (async () => {
      const shellInfo = await native.shellInfo();
      const prefs = await readSettings();
      setInfo(shellInfo);
      setCollapsed(prefs.collapsed);
      const keys = shellInfo.apps.map((a) => a.key);
      const wanted = prefs.startApp === "last" ? prefs.lastApp : prefs.startApp;
      open(wanted && keys.includes(wanted) ? wanted : "mis");
    })();
  }, [open]);

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
      on("nga://loaded", ({ key, url }) => dispatch({ type: "loaded", key, url })),
      on("nga://title", ({ key, title }) => dispatch({ type: "title", key, title })),
      on("nga://download", ({ success, path }) =>
        setToast({ text: success ? `Downloaded${path ? ` ${path.split(/[\\/]/).pop()}` : ""}` : "Download failed", path }),
      ),
      on("nga://signed-out", () => {
        dispatch({ type: "reset" });
        setActive(null);
        open("mis");
      }),
    ];
    return () => subs.forEach((p) => void p.then((off) => off()));
  }, [open]);

  // Tell Rust where the app area is, whenever the layout moves.
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      void native.setInsets(r.left, r.top);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsed, info]);

  // Settings covers the app area (native webviews draw above this page).
  useEffect(() => void native.setCovered(page !== "app"), [page]);

  const view = active ? views[active] : undefined;
  const starting = page === "app" && view?.status === "starting";
  useEffect(() => {
    if (!starting) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [starting]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!info) return <div className="boot" />;
  const app = info.apps.find((a) => a.key === active) ?? null;

  return (
    <div className="layout">
      <Sidebar
        apps={info.apps}
        active={active}
        page={page}
        views={views}
        collapsed={collapsed}
        onOpen={open}
        onSettings={() => setPage("settings")}
        onToggle={() => {
          setCollapsed(!collapsed);
          void saveSetting("collapsed", !collapsed);
        }}
      />
      <main className="main">
        <Header app={app} view={view} page={page} />
        <div className="viewport" ref={viewport}>
          {page === "settings" ? (
            <Settings info={info} />
          ) : app && view?.status !== "ready" ? (
            <Splash
              app={app}
              slow={isSlow(view, now)}
              onRetry={() => {
                dispatch({ type: "retry", key: app.key, at: Date.now() });
                void native.reload();
              }}
            />
          ) : null}
        </div>
      </main>
      {toast && page === "settings" && (
        <div className="toast" role="status">
          <Download size={16} />
          <span>{toast.text}</span>
          <button className="link" onClick={() => native.showDownloads(toast.path)}>Show in folder</button>
          <button className="icon" onClick={() => setToast(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}
      {toast && page === "app" && (
        <div className="toast toast-sidebar" role="status">
          <Download size={16} />
          <span>{toast.text}</span>
          <button className="link" onClick={() => native.showDownloads(toast.path)}>Show</button>
        </div>
      )}
    </div>
  );
}
