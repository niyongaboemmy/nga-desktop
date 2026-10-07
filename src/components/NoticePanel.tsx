import { useEffect, useState } from "react";
import { AlarmClock, BellOff, BellRing, CheckCheck, Trash2, X } from "lucide-react";
import { native, on, type DesktopApp, type Notice, type OsPermission } from "../lib/native";
import { useLang, type Lang, type Translate } from "../tools/i18n";

const ago = (at: number, now: number, t: Translate, lang: Lang) => {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return t("shell.time.justNow");
  if (s < 3600) return t("shell.time.agoMin", { n: Math.floor(s / 60) });
  if (s < 86400) return t("shell.time.agoH", { n: Math.floor(s / 3600) });
  return new Date(at).toLocaleDateString(lang);
};

/** Every notification from every NGA app. A side panel: the app stays usable beside it. */
export function NoticePanel({ apps, onClose }: { apps: DesktopApp[]; onClose: () => void }) {
  const [items, setItems] = useState<Notice[]>([]);
  const [perm, setPerm] = useState<OsPermission>("unknown");
  const [filter, setFilter] = useState<"all" | DesktopApp["key"]>("all");
  const [snoozing, setSnoozing] = useState<number | null>(null);
  const { t, lang } = useLang();
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
    <aside className="panel" aria-label={t("shell.notices.title")}>
      <div className="panel-head">
        <strong>{t("shell.notices.title")}</strong>
        <div className="panel-actions">
          <button disabled={!items.some((n) => !n.read)} onClick={() => native.readAllNotices()} title={t("shell.notices.markAll")}><CheckCheck size={16} /></button>
          <button disabled={!items.length} onClick={() => native.clearNotices()} title={t("shell.notices.clearAll")}><Trash2 size={15} /></button>
          <button onClick={onClose} title={t("shell.common.close")}><X size={16} /></button>
        </div>
      </div>
      {perm === "denied" || perm === "prompt" ? (
        <div className="perm-card">
          <BellRing size={18} />
          <span>{perm === "denied" ? t("shell.notices.blocked") : t("shell.notices.ask")}</span>
          <button
            className="btn primary sm"
            onClick={async () => setPerm(perm === "denied" ? (await native.osOpenSettings(), perm) : await native.osPermissionRequest())}
          >
            {perm === "denied" ? t("shell.notices.openSettings") : t("shell.common.allow")}
          </button>
        </div>
      ) : null}
      <div className="chips">
        {(["all", ...apps.map((a) => a.key)] as const).map((k) => (
          <button key={k} className={`chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>
            {k === "all" ? t("shell.notices.all") : name(k)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="empty">
          <BellOff size={28} className="muted" />
          <p className="muted">{t("shell.notices.empty")}</p>
        </div>
      ) : (
        <ul className="notice-list">
          {shown.map((n, i) => (
            <li key={n.id} className="notice-row" style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}>
              <button
                className={`notice-snooze${snoozing === n.id ? " on" : ""}`}
                aria-label={t("shell.notices.snooze")}
                aria-expanded={snoozing === n.id}
                title={t("shell.notices.snooze")}
                onClick={() => setSnoozing(snoozing === n.id ? null : n.id)}
              >
                <AlarmClock size={14} />
              </button>
              {snoozing === n.id && (
                <div className="snooze-menu" role="group" aria-label={t("shell.notices.snoozeIn")}>
                  {([10, 60, 180] as const).map((m) => (
                    <button
                      key={m}
                      className="chip"
                      onClick={() => {
                        setSnoozing(null);
                        void native.snoozeNotice(n.id, m);
                      }}
                    >
                      {m < 60 ? t("shell.time.min", { n: m }) : t("shell.time.h", { n: m / 60 })}
                    </button>
                  ))}
                </div>
              )}
              <button className={`notice${n.read ? "" : " unread"}`} onClick={() => native.openNotice(n.id)}>
                <img src={`/apps/${n.app}.png`} alt="" />
                <span className="notice-text">
                  <span className="notice-head">
                    <strong>{n.title}</strong>
                    <span className="muted">{ago(n.at, now, t, lang)}</span>
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
