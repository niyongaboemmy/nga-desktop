import { useMemo, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { Search, Star } from "lucide-react";
import { FORMULAS, searchFormulas, type Formula, type Subject } from "./formulaData";
import { usePersonal } from "../shared/store";
import type { ToolProps } from "../types";

const SUBJECTS: Subject[] = ["maths", "physics", "chemistry", "biology"];
const key = (f: Formula) => `${f.subject}:${f.name}`;

export default function Formulas({ ctx }: ToolProps) {
  const { t, identity, present } = ctx;
  const [subject, setSubject] = usePersonal<Subject | "starred">(identity, "formulas.subject", "maths");
  const [level, setLevel] = usePersonal<"all" | Formula["level"]>(identity, "formulas.level", "all");
  const [stars, setStars] = usePersonal<string[]>(identity, "formulas.stars", []);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const base = q.trim() ? FORMULAS : FORMULAS.filter((f) => (subject === "starred" ? stars.includes(key(f)) : f.subject === subject));
    return searchFormulas(base, q).filter((f) => level === "all" || f.level === level);
  }, [q, subject, stars, level]);
  const topics = [...new Set(list.map((f) => f.topic))];
  return (
    <div className={`formulas${present ? " big" : ""}`}>
      <label className="tool-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("formulas.search")} spellCheck={false} /></label>
      <div className="formulas-bar">
        <div className="segmented-sm">
          {SUBJECTS.map((s) => <button key={s} className={subject === s && !q ? "on" : ""} onClick={() => { setSubject(s); setQ(""); }}>{t(`formulas.${s}` as never)}</button>)}
          <button className={subject === "starred" && !q ? "on" : ""} onClick={() => { setSubject("starred"); setQ(""); }}><Star size={12} /></button>
        </div>
        <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} aria-label={t("formulas.level")}>
          <option value="all">{t("formulas.allLevels")}</option>
          <option value="S1–S3">S1–S3</option>
          <option value="S4–S6">S4–S6</option>
        </select>
      </div>
      {list.length === 0 && <p className="muted small">{subject === "starred" && !q ? t("formulas.noStars") : t("panel.noMatch", { q })}</p>}
      {topics.map((topic) => (
        <section key={topic} className="f-topic">
          <h4>{topic}</h4>
          {list.filter((f) => f.topic === topic).map((f) => {
            const starred = stars.includes(key(f));
            return (
              <div key={key(f)} className="f-card">
                <div className="f-head">
                  <strong>{f.name}</strong>
                  <span className="f-level">{f.level}</span>
                  <button className={`fav${starred ? " on" : ""}`} onClick={() => setStars((s) => (starred ? s.filter((x) => x !== key(f)) : [...s, key(f)]))} aria-pressed={starred} aria-label={t("panel.favourite")}><Star size={13} /></button>
                </div>
                <div className="f-tex" dangerouslySetInnerHTML={{ __html: katex.renderToString(f.tex, { displayMode: true, throwOnError: false, output: "htmlAndMathml" }) }} />
                {f.note && <p className="muted small">{f.note}</p>}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
