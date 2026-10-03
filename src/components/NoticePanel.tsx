import { useEffect, useState } from "react";
import { BellOff, BellRing, CheckCheck, Trash2, X } from "lucide-react";
import { native, on, type DesktopApp, type Notice, type OsPermission } from "../lib/native";

const ago = (at: number, now: number) => {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return new Date(at).toLocaleDateString();
};

/** Every notification from every NGA app. A side panel: the app stays usable beside it. */
export function NoticePanel({ apps, onClose }: { apps: DesktopApp[]; onClose: () => void }) {
  const [items, setItems] = useState<Notice[]>([]);
  const [perm, setPerm] = useState<OsPermission>("unknown");
  const [filter, setFilter] = useState<"all" | DesktopApp["key"]>("all");
  const now = Date.now();
  useEffect(() => {
    const load = () => void native.notices().then(setItems);
    load();
    void native.osPermission().then(setPerm);
    const sub = on("nga://notices", load);
    return () => void sub.then((off) => off());
  }, []);
  const name = (key: string) => apps.find((a) => a.key === key)?.name ?? key;
  const shown = filter === "all" ? items : items.filter((n) => n.app === filter);

  return (
    <aside className="panel" aria-label="Notifications">
      <div className="panel-head">
        <strong>Notifications</strong>
        <div className="panel-actions">
          <button disabled={!items.some((n) => !n.read)} onClick={() => native.readAllNotices()} title="Mark all read"><CheckCheck size={16} /></button>
          <button disabled={!items.length} onClick={() => native.clearNotices()} title="Clear all"><Trash2 size={15} /></button>
          <button onClick={onClose} title="Close"><X size={16} /></button>
        </div>
      </div>
      {perm === "denied" || perm === "prompt" ? (
        <div className="perm-card">
          <BellRing size={18} />
          <span>{perm === "denied" ? "This computer is blocking NGA's notifications." : "Let NGA show notifications on this computer."}</span>
          <button
            className="btn primary sm"
            onClick={async () => setPerm(perm === "denied" ? (await native.osOpenSettings(), perm) : await native.osPermissionRequest())}
          >
            {perm === "denied" ? "Open settings" : "Allow"}
          </button>
        </div>
      ) : null}
      <div className="chips">
        {(["all", ...apps.map((a) => a.key)] as const).map((k) => (
          <button key={k} className={`chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>
            {k === "all" ? "All" : name(k)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="empty">
          <BellOff size={28} className="muted" />
          <p className="muted">You're all caught up.</p>
        </div>
      ) : (
        <ul className="notice-list">
          {shown.map((n, i) => (
            <li key={n.id} style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}>
              <button className={`notice${n.read ? "" : " unread"}`} onClick={() => native.openNotice(n.id)}>
                <img src={`/apps/${n.app}.png`} alt="" />
                <span className="notice-text">
                  <span className="notice-head">
                    <strong>{n.title}</strong>
                    <span className="muted">{ago(n.at, now)}</span>
                  </span>
                  {n.body && <span className="notice-body">{n.body}</span>}
                  <span className="notice-app">{name(n.app)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
