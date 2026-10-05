import { useEffect, useRef, useState } from "react";
import { Shuffle, UserCheck, UserX } from "lucide-react";
import { pickFair, pickRandom, shuffle, type Person } from "./logic";
import { useClassLists } from "./roster";
import { ListPicker, listById } from "./ListPicker";
import { usePersonal } from "../shared/store";
import type { ToolProps } from "../types";

/** Random name picker: fair rounds by default, absent students skipped, a short reveal. */
export default function Picker({ ctx }: ToolProps) {
  const { t, identity, present } = ctx;
  const roster = useClassLists(identity);
  const [listId, setListId] = usePersonal<string | null>(identity, "picker.list", null);
  const [fair, setFair] = usePersonal<boolean>(identity, "picker.fair", true);
  const [round, setRound] = useState<Record<string, Array<Person["id"]>>>({});
  const [absent, setAbsent] = useState<Record<string, Array<Person["id"]>>>({});
  const [shown, setShown] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [showList, setShowList] = useState(false);
  const timer = useRef(0);
  const list = listById(roster.lists, listId) ?? roster.lists[0] ?? null;
  const key = list?.id ?? "";
  const away = absent[key] ?? [];
  const picked = round[key] ?? [];

  useEffect(() => () => window.clearInterval(timer.current), []);

  const pick = () => {
    if (!list || rolling) return;
    const result = fair ? pickFair(list.people, picked, away) : { person: pickRandom(list.people, away), picked };
    if (!result.person) return;
    const winner = result.person;
    setRound((r) => ({ ...r, [key]: result.picked }));
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(winner.name);
      setHistory((h) => [winner.name, ...h].slice(0, 12));
      return;
    }
    // A short slot-machine reveal, slowing down onto the winner.
    setRolling(true);
    const names = shuffle(list.people.filter((p) => !away.includes(p.id)).map((p) => p.name));
    let i = 0, delay = 45;
    const step = () => {
      setShown(names[i++ % names.length]);
      delay *= 1.16;
      if (delay < 260) timer.current = window.setTimeout(step, delay);
      else {
        setShown(winner.name);
        setRolling(false);
        setHistory((h) => [winner.name, ...h].slice(0, 12));
      }
    };
    step();
  };

  const toggleAbsent = (id: Person["id"]) =>
    setAbsent((a) => ({ ...a, [key]: away.includes(id) ? away.filter((x) => x !== id) : [...away, id] }));
  const presentCount = list ? list.people.length - away.length : 0;
  const left = list ? list.people.filter((p) => !away.includes(p.id) && !picked.includes(p.id)).length : 0;

  return (
    <div className={`picker${present ? " big" : ""}`}>
      {!present && <ListPicker t={t} value={list?.id ?? null} onChange={setListId} roster={roster} />}
      <button className={`pick-stage${rolling ? " rolling" : ""}${shown && !rolling ? " landed" : ""}`} onClick={pick} disabled={!list || presentCount === 0} aria-live="polite">
        <span className="pick-name">{shown ?? (list ? t("picker.tap") : t("class.none"))}</span>
        {!present && list && <span className="pick-hint">{t("picker.space")}</span>}
      </button>
      <div className="row center">
        <button className="btn primary" onClick={pick} disabled={!list || presentCount === 0 || rolling}><Shuffle size={15} /> {t("picker.pick")}</button>
        {!present && (
          <label className="switch-row compact">
            <input type="checkbox" className="switch" checked={fair} onChange={(e) => setFair(e.target.checked)} />
            <span>{t("picker.fair")}</span>
          </label>
        )}
      </div>
      {list && <p className="muted small center-text">{fair ? t("picker.left", { n: left, of: presentCount }) : t("picker.present", { n: presentCount })}</p>}
      {!present && list && (
        <>
          <button className="link-btn" onClick={() => setShowList((s) => !s)}><UserCheck size={13} /> {t("picker.attendance")}</button>
          {showList && (
            <ul className="attendance">
              {list.people.map((p) => {
                const isAway = away.includes(p.id);
                return (
                  <li key={p.id}>
                    <button className={isAway ? "away" : ""} onClick={() => toggleAbsent(p.id)} aria-pressed={!isAway}>
                      {isAway ? <UserX size={13} /> : <UserCheck size={13} />} {p.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {history.length > 1 && <p className="muted small">{t("picker.history")}: {history.slice(1).join(" · ")}</p>}
        </>
      )}
    </div>
  );
}
