import { useMemo, useState } from "react";
import { FlaskConical, Search } from "lucide-react";
import { CATEGORY_COLOR, ELEMENT_LIST, FormulaError, molarMass, type Element } from "./chem";
import type { ToolProps } from "../types";
import type { Translate } from "../i18n";

const k2c = (k: number | null) => (k === null ? "—" : `${Math.round((k - 273.15) * 10) / 10} °C`);

export default function Periodic({ ctx }: ToolProps) {
  const { t, present } = ctx;
  const [sel, setSel] = useState<Element>(ELEMENT_LIST[0]);
  const [q, setQ] = useState("");
  const [formula, setFormula] = useState("H2SO4");
  const qq = q.trim().toLowerCase();
  const match = (e: Element) => !qq || e.symbol.toLowerCase() === qq || e.name.toLowerCase().includes(qq) || String(e.z) === qq;
  const mm = useMemo(() => {
    try {
      return { ok: molarMass(formula) };
    } catch (e) {
      const m = e instanceof FormulaError ? e.message : "syntax";
      return { err: m.startsWith("unknown:") ? t("pt.unknown", { s: m.slice(8) }) : m === "brackets" ? t("pt.brackets") : t("pt.syntax") };
    }
  }, [formula, t]);

  return (
    <div className={`periodic${present ? " big" : ""}`}>
      <div className="pt-top">
        <label className="tool-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pt.search")} spellCheck={false} /></label>
        <div className="pt-legend">{Object.entries(CATEGORY_COLOR).map(([c, col]) => <span key={c} style={{ ["--c" as string]: col }}>{t(`pt.cat.${c}` as never) || c}</span>)}</div>
      </div>
      <div className="pt-grid" role="group" aria-label={t("tool.periodic")}>
        {ELEMENT_LIST.map((e) => (
          <button
            key={e.z}
            className={`pt-cell${sel.z === e.z ? " on" : ""}${match(e) ? "" : " dim"}`}
            style={{ gridRow: e.row, gridColumn: e.col, ["--c" as string]: CATEGORY_COLOR[e.category] ?? "#64748b" }}
            onClick={() => setSel(e)}
            data-z={e.z}
          >
            <span className="pt-z">{e.z}</span>
            <strong>{e.symbol}</strong>
            {/* Screen readers hear "26 Fe Iron"; the visible text stays part of the name. */}
            <span className="sr-only"> {e.name}</span>
          </button>
        ))}
        <span className="pt-f-mark" style={{ gridRow: 6, gridColumn: 3 }}>57–71</span>
        <span className="pt-f-mark" style={{ gridRow: 7, gridColumn: 3 }}>89–103</span>
        <Detail e={sel} t={t} />
      </div>
      <div className="mm">
        <label className="field"><span><FlaskConical size={12} /> {t("pt.molar")}</span><input value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="Ca(OH)2, CuSO4·5H2O" spellCheck={false} /></label>
        {"ok" in mm && mm.ok ? (
          <div className="mm-result">
            <strong>{mm.ok.total} g/mol</strong>
            <span className="muted small">{mm.ok.parts.map((p) => `${p.symbol}${p.count > 1 ? p.count : ""} ${p.percent.toFixed(1)}%`).join(" · ")}</span>
          </div>
        ) : <p className="field-error">{"err" in mm ? mm.err : ""}</p>}
      </div>
      <p className="muted small">{t("pt.source")}</p>
    </div>
  );
}

function Detail({ e, t }: { e: Element; t: Translate }) {
  return (
    <div className="pt-detail" style={{ ["--c" as string]: CATEGORY_COLOR[e.category] ?? "#64748b" }}>
      <div className="pt-big"><span>{e.z}</span><strong>{e.symbol}</strong><span>{e.mass}</span></div>
      <div className="pt-facts">
        <strong>{e.name}</strong>
        <span className="pt-cat">{t(`pt.cat.${e.category}` as never) || e.category}</span>
        <dl>
          <dt>{t("pt.config")}</dt><dd>{e.config}</dd>
          <dt>{t("pt.position")}</dt><dd>{t("pt.periodGroup", { p: e.period, g: e.group ?? "—" })}</dd>
          <dt>{t("pt.state")}</dt><dd>{e.state || "—"}</dd>
          <dt>{t("pt.en")}</dt><dd>{e.electronegativity ?? "—"}</dd>
          <dt>{t("pt.mp")}</dt><dd>{k2c(e.meltK)} / {k2c(e.boilK)}</dd>
        </dl>
      </div>
    </div>
  );
}
