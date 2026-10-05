import { useMemo, useState } from "react";
import { ArrowDownUp, Copy } from "lucide-react";
import { CATEGORIES, convert, parseNumber, show } from "./units";
import type { ToolProps } from "../types";

export default function Converter({ ctx }: ToolProps) {
  const { t } = ctx;
  const [cat, setCat] = useState(CATEGORIES[0].id);
  const category = CATEGORIES.find((c) => c.id === cat)!;
  const [from, setFrom] = useState(category.units[2]?.id ?? category.units[0].id);
  const [to, setTo] = useState(category.units[3]?.id ?? category.units[1].id);
  const [text, setText] = useState("1");
  const value = parseNumber(text);

  const pickCategory = (id: string) => {
    const c = CATEGORIES.find((x) => x.id === id)!;
    setCat(id);
    setFrom(c.units[0].id);
    setTo(c.units[1].id);
  };

  const result = value === null ? null : convert(value, from, to);
  const label = (id: string) => category.units.find((u) => u.id === id)?.label ?? id;
  const all = useMemo(
    () => (value === null ? [] : category.units.filter((u) => u.id !== from).map((u) => ({ u, v: convert(value, from, u.id) }))),
    [value, from, category],
  );

  return (
    <div className="conv">
      <div className="chips scroll" role="tablist">
        {CATEGORIES.map((c) => (
          <button key={c.id} role="tab" aria-selected={c.id === cat} className={`chip${c.id === cat ? " on" : ""}`} onClick={() => pickCategory(c.id)}>
            {t(c.title)}
          </button>
        ))}
      </div>
      <div className="conv-box">
        <label className="field">
          <span>{t("conv.value")}</span>
          <div className="conv-line">
            <input className={value === null && text.trim() ? "bad" : ""} value={text} onChange={(e) => setText(e.target.value)} inputMode="decimal" aria-label={t("conv.value")} />
            <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("conv.from")}>
              {category.units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
        </label>
        <button className="icon-btn swap" onClick={() => { setFrom(to); setTo(from); }} title={t("conv.swap")} aria-label={t("conv.swap")}>
          <ArrowDownUp size={16} />
        </button>
        <div className="field">
          <span>{t("conv.result")}</span>
          <div className="conv-line">
            <output className="conv-result">{show(result)}</output>
            <select value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("conv.to")}>
              {category.units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
        </div>
        {result !== null && (
          <button className="btn sm" onClick={() => void navigator.clipboard.writeText(`${show(result)} ${label(to)}`)}>
            <Copy size={13} /> {t("conv.copy")}
          </button>
        )}
      </div>
      {all.length > 0 && (
        <table className="conv-table">
          <caption className="muted small">{t("conv.allUnits", { v: text, unit: label(from) })}</caption>
          <tbody>
            {all.map(({ u, v }) => (
              <tr key={u.id}><td>{show(v)}</td><th scope="row">{u.label}</th></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
