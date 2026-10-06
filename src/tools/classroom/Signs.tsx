import { useState } from "react";
import { usePersonal } from "../shared/store";
import type { ToolProps } from "../types";
import type { Key } from "../i18n";

interface Sign {
  id: string;
  emoji: string;
  text: string;
  color: string;
}

const PRESETS: Array<{ id: string; emoji: string; key: Key; color: string }> = [
  { id: "silent", emoji: "🤫", key: "signs.silent", color: "#ef4444" },
  { id: "whisper", emoji: "🗣️", key: "signs.whisper", color: "#f59e0b" },
  { id: "group", emoji: "👥", key: "signs.group", color: "#22c55e" },
  { id: "hands", emoji: "✋", key: "signs.hands", color: "#3b82f6" },
  { id: "ask3", emoji: "3️⃣", key: "signs.ask3", color: "#a855f7" },
  { id: "eyes", emoji: "👀", key: "signs.eyes", color: "#0ea5e9" },
  { id: "tidy", emoji: "🧹", key: "signs.tidy", color: "#14b8a6" },
  { id: "break", emoji: "☕", key: "signs.break", color: "#64748b" },
];

/** Work-mode signs ("traffic light"): one big, readable instruction for the class. */
export default function Signs({ ctx }: ToolProps) {
  const { t, identity, present } = ctx;
  const signs: Sign[] = PRESETS.map((p) => ({ id: p.id, emoji: p.emoji, text: t(p.key), color: p.color }));
  const [current, setCurrent] = usePersonal<Sign | null>(identity, "signs.current", null);
  const [custom, setCustom] = useState("");
  const show = current ?? signs[0];
  return (
    <div className={`signs${present ? " big" : ""}`}>
      <div className="sign-stage" style={{ ["--c" as string]: show.color }} aria-live="polite">
        <span className="sign-emoji" aria-hidden>{show.emoji}</span>
        <span className="sign-text">{show.text}</span>
      </div>
      {!present && (
        <>
          <div className="sign-grid">
            {signs.map((s) => (
              <button key={s.id} className={show.id === s.id ? "on" : ""} style={{ ["--c" as string]: s.color }} onClick={() => setCurrent(s)}>
                <span aria-hidden>{s.emoji}</span> {s.text}
              </button>
            ))}
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) setCurrent({ id: "custom", emoji: "📌", text: custom.trim().slice(0, 60), color: "#f97316" }); setCustom(""); }}>
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={t("signs.custom")} maxLength={60} style={{ flex: 1 }} />
            <button className="btn sm" type="submit" disabled={!custom.trim()}>{t("signs.show")}</button>
          </form>
          <p className="muted small">{t("signs.presentHint")}</p>
        </>
      )}
    </div>
  );
}
