import { Plus, Trash2 } from "lucide-react";
import { bandFor, computeGrade, DEFAULT_BANDS, neededFor, type Band, type Component } from "./logic";
import { usePersonal } from "../shared/store";
import type { ToolProps } from "../types";

const num = (v: string): number | null => {
  if (!v.trim()) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export default function Grades({ ctx }: ToolProps) {
  const { t, identity } = ctx;
  const [rows, setRows] = usePersonal<Component[]>(identity, "grades.rows", [
    { name: "CAT 1", weight: 20, score: null, max: 20 },
    { name: "CAT 2", weight: 20, score: null, max: 20 },
    { name: t("grades.exam"), weight: 60, score: null, max: 100 },
  ]);
  const [bands, setBands] = usePersonal<Band[]>(identity, "grades.bands", DEFAULT_BANDS);
  const [target, setTarget] = usePersonal<number>(identity, "grades.target", 70);
  const r = computeGrade(rows, bands);
  const need = neededFor(rows, target);
  const set = (i: number, patch: Partial<Component>) => setRows((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="grades">
      <table className="grade-table">
        <thead><tr><th>{t("grades.component")}</th><th>{t("grades.weight")}</th><th>{t("grades.score")}</th><th>{t("grades.outOf")}</th><th /></tr></thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={i}>
              <td><input value={c.name} onChange={(e) => set(i, { name: e.target.value })} aria-label={t("grades.component")} /></td>
              <td><input inputMode="decimal" value={c.weight || ""} onChange={(e) => set(i, { weight: num(e.target.value) ?? 0 })} aria-label={t("grades.weight")} /></td>
              <td><input inputMode="decimal" value={c.score ?? ""} placeholder="—" onChange={(e) => set(i, { score: num(e.target.value) })} aria-label={t("grades.score")} /></td>
              <td><input inputMode="decimal" value={c.max || ""} onChange={(e) => set(i, { max: num(e.target.value) ?? 0 })} aria-label={t("grades.outOf")} /></td>
              <td><button className="icon-btn" onClick={() => setRows((l) => l.filter((_, j) => j !== i))} aria-label={t("notes.delete")}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn sm" onClick={() => setRows((l) => [...l, { name: `${t("grades.component")} ${l.length + 1}`, weight: 10, score: null, max: 100 }])}><Plus size={13} /> {t("grades.add")}</button>
      {r.totalWeight !== 100 && r.totalWeight > 0 && <p className="field-error">{t("grades.weightsNot100", { n: r.totalWeight })}</p>}
      <div className="result-cards">
        <div className="result-card big">
          <strong>{r.current === null ? "—" : `${r.current}%`}</strong>
          <span>{r.band ? `${r.band.grade} · ${r.band.label}` : t("grades.nothingYet")}</span>
        </div>
        <div className="result-card">
          <strong>{r.assessed}%</strong>
          <span>{t("grades.assessed")}</span>
        </div>
      </div>
      <div className="grade-target">
        <label className="field"><span>{t("grades.target")}</span><input inputMode="decimal" value={target} onChange={(e) => setTarget(num(e.target.value) ?? 0)} /></label>
        <p className={need !== null && need > 100 ? "field-error" : "muted"}>
          {need === null ? t("grades.allDone") : need > 100 ? t("grades.notReachable", { n: need }) : need <= 0 ? t("grades.alreadySafe") : t("grades.need", { n: need, band: bandFor(target, bands)?.grade ?? "" })}
        </p>
      </div>
      <details className="bands">
        <summary>{t("grades.bands")}</summary>
        <table>
          <tbody>
            {bands.map((b, i) => (
              <tr key={i}>
                <td><input value={b.grade} onChange={(e) => setBands((l) => l.map((x, j) => (j === i ? { ...x, grade: e.target.value.slice(0, 3) } : x)))} aria-label={t("grades.grade")} /></td>
                <td>≥ <input inputMode="decimal" value={b.min} onChange={(e) => setBands((l) => l.map((x, j) => (j === i ? { ...x, min: num(e.target.value) ?? 0 } : x)))} aria-label={t("grades.min")} />%</td>
                <td><input value={b.label} onChange={(e) => setBands((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label={t("grades.label")} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="link-btn" onClick={() => setBands(DEFAULT_BANDS)}>{t("grades.resetBands")}</button>
      </details>
    </div>
  );
}
