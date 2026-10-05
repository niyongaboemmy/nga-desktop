import { useMemo, useState } from "react";
import { Copy, Shuffle, Users } from "lucide-react";
import { groupsText, makeGroups, type Person } from "./logic";
import { useClassLists } from "./roster";
import { ListPicker, listById } from "./ListPicker";
import { usePersonal } from "../shared/store";
import { Stepper } from "../shared/Stepper";
import type { ToolProps } from "../types";

const COLORS = ["#3b82f6", "#f59e0b", "#22c55e", "#ef4444", "#a855f7", "#14b8a6", "#ec4899", "#64748b"];

export default function Groups({ ctx }: ToolProps) {
  const { t, identity, present } = ctx;
  const roster = useClassLists(identity);
  const [listId, setListId] = usePersonal<string | null>(identity, "groups.list", null);
  const [by, setBy] = usePersonal<"size" | "count">(identity, "groups.by", "size");
  const [n, setN] = usePersonal<number>(identity, "groups.n", 4);
  const [apartAll, setApartAll] = usePersonal<Record<string, Array<[Person["id"], Person["id"]]>>>(identity, "groups.apart", {});
  const [result, setResult] = usePersonal<{ list: string; groups: Person[][]; clashes: number } | null>(identity, "groups.last", null);
  const [copied, setCopied] = useState(false);
  const [pair, setPair] = useState<[string, string]>(["", ""]);
  const list = listById(roster.lists, listId) ?? roster.lists[0] ?? null;
  const apart = list ? apartAll[list.id] ?? [] : [];
  const nameOf = (id: Person["id"]) => list?.people.find((p) => p.id === id)?.name ?? "?";

  const make = () => {
    if (!list) return;
    const r = makeGroups(list.people, { by, n, apart });
    setResult({ list: list.id, ...r });
  };
  const groups = result && list && result.list === list.id ? result.groups : null;
  const preview = useMemo(() => {
    if (!list?.people.length) return null;
    const count = Math.max(1, Math.min(list.people.length, by === "size" ? Math.ceil(list.people.length / n) : n));
    return t("groups.preview", { groups: count, min: Math.floor(list.people.length / count), max: Math.ceil(list.people.length / count) });
  }, [list, by, n, t]);

  return (
    <div className={`groups${present ? " big" : ""}`}>
      {!present && (
        <>
          <ListPicker t={t} value={list?.id ?? null} onChange={setListId} roster={roster} />
          <div className="groups-controls">
            <div className="segmented-sm">
              <button className={by === "size" ? "on" : ""} onClick={() => setBy("size")}>{t("groups.bySize")}</button>
              <button className={by === "count" ? "on" : ""} onClick={() => setBy("count")}>{t("groups.byCount")}</button>
            </div>
            <Stepper label={by === "size" ? t("groups.perGroup") : t("groups.howMany")} value={n} min={1} max={40} onChange={setN} />
            <button className="btn primary" onClick={make} disabled={!list}><Shuffle size={15} /> {groups ? t("groups.again") : t("groups.make")}</button>
          </div>
          {preview && <p className="muted small">{preview}</p>}
        </>
      )}
      {groups ? (
        <ol className="group-grid">
          {groups.map((g, i) => (
            <li key={i} className="group-card" style={{ ["--c" as string]: COLORS[i % COLORS.length] }}>
              <strong><Users size={13} /> {t("groups.group", { n: i + 1 })}</strong>
              <ul>{g.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
            </li>
          ))}
        </ol>
      ) : (
        !present && <p className="muted small">{t("groups.empty")}</p>
      )}
      {!present && groups && (
        <div className="row">
          <button className="btn sm" onClick={() => void navigator.clipboard.writeText(groupsText(groups, t("groups.groupWord"))).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); })}>
            <Copy size={13} /> {copied ? t("calc.copied") : t("groups.copy")}
          </button>
          {result && result.clashes > 0 && <span className="field-error">{t("groups.clashes", { n: result.clashes })}</span>}
        </div>
      )}
      {!present && list && list.people.length > 1 && (
        <details className="apart">
          <summary>{t("groups.apart", { n: apart.length })}</summary>
          <div className="row">
            {[0, 1].map((k) => (
              <select key={k} value={pair[k]} onChange={(e) => setPair((p) => (k === 0 ? [e.target.value, p[1]] : [p[0], e.target.value]))} aria-label={t("groups.person")}>
                <option value="">{t("groups.person")}</option>
                {list.people.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
              </select>
            ))}
            <button className="btn sm" disabled={!pair[0] || !pair[1] || pair[0] === pair[1]} onClick={() => {
              const a = list.people.find((p) => String(p.id) === pair[0])!.id, b = list.people.find((p) => String(p.id) === pair[1])!.id;
              setApartAll((all) => ({ ...all, [list.id]: [...apart, [a, b]] }));
              setPair(["", ""]);
            }}>{t("groups.addPair")}</button>
          </div>
          <ul className="pairs">
            {apart.map(([a, b], i) => (
              <li key={i}>{nameOf(a)} ↔ {nameOf(b)} <button className="link-btn" onClick={() => setApartAll((all) => ({ ...all, [list.id]: apart.filter((_, j) => j !== i) }))}>{t("notes.delete")}</button></li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
