import { PanelLeftClose, PanelLeftOpen, Settings as SettingsIcon } from "lucide-react";
import type { AppKey, DesktopApp } from "../lib/native";
import type { Views } from "../lib/appState";

const mod = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl+";

interface Props {
  apps: DesktopApp[];
  active: AppKey | null;
  page: "app" | "settings";
  views: Views;
  collapsed: boolean;
  onOpen: (key: AppKey) => void;
  onSettings: () => void;
  onToggle: () => void;
}

export function Sidebar({ apps, active, page, views, collapsed, onOpen, onSettings, onToggle }: Props) {
  return (
    <nav className={`sidebar${collapsed ? " collapsed" : ""}`} aria-label="NGA apps">
      <div className="brand">
        <img src="/apps/mis.png" alt="" />
        {!collapsed && <span>NGA</span>}
      </div>
      <ul>
        {apps.map((a, i) => {
          const current = page === "app" && a.key === active;
          const v = views[a.key];
          return (
            <li key={a.key}>
              <button
                className={`app-link${current ? " current" : ""}`}
                style={{ ["--app" as string]: a.color }}
                onClick={() => onOpen(a.key)}
                title={collapsed ? `${a.name} (${mod}${i + 1})` : `${a.description} (${mod}${i + 1})`}
                aria-current={current ? "page" : undefined}
              >
                <img src={`/apps/${a.key}.png`} alt="" />
                {!collapsed && (
                  <span className="app-text">
                    <span className="app-name">{a.name}</span>
                    <span className="app-desc">{a.description}</span>
                  </span>
                )}
                {v?.status === "ready" && <span className="dot" aria-label="open" />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="sidebar-foot">
        <button className={`foot-btn${page === "settings" ? " current" : ""}`} onClick={onSettings} title="Settings">
          <SettingsIcon size={18} />
          {!collapsed && <span>Settings</span>}
        </button>
        <button className="foot-btn" onClick={onToggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </nav>
  );
}
