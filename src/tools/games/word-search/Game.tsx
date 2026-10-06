import { useEffect, useRef, useState } from "react";
import { lineCells, mark, newGame, type Size, type State } from "./logic";
import { packsFor } from "./packs";
import { tone } from "./sound";
import { hash } from "../seed";
import type { Lang } from "../../i18n";
import type { GameProps } from "../types";
import "./style.css";
export { strings } from "./strings";

const LANGS: Lang[] = ["en", "fr", "rw"];
type Cell = [number, number];

export default function Game({ saved, save, paused, seed, lang, tr, finish, sound, reducedMotion }: GameProps<State>) {
  const state = saved ?? newGame(lang, packsFor(lang)[0].id, 10, seed);
  const ref = useRef(state);
  ref.current = state;
  useEffect(() => {
    if (!saved) save(state);
  }, [saved, save, state]);

  const { size, grid } = state;
  /** The first letter of a selection (drag start, first click or Space). */
  const [anchor, setAnchor] = useState<Cell | null>(null);
  /** Where the pointer or the keyboard cursor is now. */
  const [hover, setHover] = useState<Cell | null>(null);
  const [cursor, setCursor] = useState<Cell>([0, 0]);
  const dragging = useRef(false);

  useEffect(() => {
    setAnchor(null);
    setHover(null);
    setCursor([0, 0]);
  }, [state.seed, state.size]);
  useEffect(() => {
    if (paused) {
      setAnchor(null);
      dragging.current = false;
    }
  }, [paused]);

  const tryMark = (a: Cell, b: Cell) => {
    const s = ref.current;
    const next = mark(s, a[0], a[1], b[0], b[1]);
    if (next === s) return;
    save(next);
    if (sound) tone(next.over ? 784 : 587, 160, "sine", 0.05);
    if (next.over) finish({ won: true });
  };

  /** A click or Space on a cell: start a selection, or end the one started. */
  const choose = (c: Cell) => {
    if (paused || ref.current.over) return;
    if (!anchor) setAnchor(c);
    else {
      if (anchor[0] !== c[0] || anchor[1] !== c[1]) tryMark(anchor, c);
      setAnchor(null);
    }
  };

  const restart = (l: Lang, pack: string, sz: Size) => {
    if (paused) return;
    const valid = packsFor(l).some((p) => p.id === pack) ? pack : packsFor(l)[0].id;
    save(newGame(l, valid, sz, hash(`${ref.current.seed}:${seed}:${Date.now()}`)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || paused) return;
      const t = e.target as HTMLElement;
      if (t?.closest("input, textarea, select")) return;
      const moves: Record<string, Cell> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      const m = moves[e.key];
      if (m) {
        e.preventDefault();
        const next: Cell = [Math.min(size - 1, Math.max(0, cursor[0] + m[0])), Math.min(size - 1, Math.max(0, cursor[1] + m[1]))];
        setCursor(next);
        setHover(next);
      } else if (e.key === " " && !t?.closest("button")) {
        e.preventDefault();
        choose(cursor);
      } else if (e.key === "Escape" && anchor) {
        e.preventDefault();
        setAnchor(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Highlights: found words, and the line being chosen.
  const foundCells = new Set<number>();
  state.found.forEach((f) => f && lineCells(size, ...f).forEach((i) => foundCells.add(i)));
  const live = anchor && hover ? lineCells(size, anchor[0], anchor[1], hover[0], hover[1]) : anchor ? [anchor[0] * size + anchor[1]] : [];
  const liveSet = new Set(live);
  const left = state.found.filter((f) => !f).length;

  const cellAt = (e: React.PointerEvent): Cell | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const i = el?.closest<HTMLElement>("[data-i]")?.dataset.i;
    if (i == null) return null;
    const n = Number(i);
    return [Math.floor(n / size), n % size];
  };

  return (
    <div className={`wsearch${reducedMotion ? " still" : ""}`}>
      <div className="wsearch-bar">
        <div className="segmented-sm" role="radiogroup" aria-label={tr("language")}>
          {LANGS.map((l) => (
            <button key={l} role="radio" aria-checked={state.lang === l} className={state.lang === l ? "on" : ""} disabled={paused}
              onClick={() => state.lang !== l && restart(l, state.pack, state.size)}>{l.toUpperCase()}</button>
          ))}
        </div>
        <div className="segmented-sm" role="radiogroup" aria-label={tr("size")}>
          {([10, 12] as Size[]).map((n) => (
            <button key={n} role="radio" aria-checked={state.size === n} className={state.size === n ? "on" : ""} disabled={paused}
              onClick={() => state.size !== n && restart(state.lang, state.pack, n)}>{n}×{n}</button>
          ))}
        </div>
        <button className="btn sm" onClick={() => restart(state.lang, state.pack, state.size)} disabled={paused}>{tr("newGrid")}</button>
      </div>
      <div className="wsearch-packs" role="radiogroup" aria-label={tr("pack")}>
        {packsFor(state.lang).map((p) => (
          <button key={p.id} role="radio" aria-checked={state.pack === p.id} className={`chip${state.pack === p.id ? " on" : ""}`} disabled={paused}
            onClick={() => state.pack !== p.id && restart(state.lang, p.id, state.size)}>{p.name[state.lang]}</button>
        ))}
      </div>

      <div className="wsearch-main">
        <div
          className="wsearch-grid"
          style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
          role="grid"
          aria-label={tr("cursor", { r: cursor[0] + 1, c: cursor[1] + 1 })}
          onPointerDown={(e) => {
            if (paused || state.over) return;
            const c = cellAt(e);
            if (!c) return;
            e.preventDefault();
            if (anchor && anchor[0] === c[0] && anchor[1] === c[1]) {
              setAnchor(null); // a second click on the first letter cancels
              return;
            }
            dragging.current = true;
            setCursor(c);
            setHover(c);
            if (!anchor) setAnchor(c);
          }}
          onPointerMove={(e) => {
            const c = cellAt(e);
            if (c && (c[0] !== hover?.[0] || c[1] !== hover?.[1])) setHover(c);
          }}
          onPointerUp={(e) => {
            if (!dragging.current) return;
            dragging.current = false;
            const c = cellAt(e);
            if (!c || !anchor) return;
            // A drag ends the selection; a click on the anchor leaves it waiting for the last letter.
            if (anchor[0] !== c[0] || anchor[1] !== c[1]) {
              tryMark(anchor, c);
              setAnchor(null);
            }
          }}
          onPointerLeave={() => setHover(null)}
        >
          {[...grid].map((ch, i) => {
            const r = Math.floor(i / size), c = i % size;
            const isCursor = cursor[0] === r && cursor[1] === c;
            return (
              <div
                key={i}
                data-i={i}
                role="gridcell"
                aria-selected={liveSet.has(i)}
                className={`wsearch-cell${foundCells.has(i) ? " found" : ""}${liveSet.has(i) ? " live" : ""}${isCursor ? " cursor" : ""}`}
              >
                {ch}
              </div>
            );
          })}
        </div>
        <div className="wsearch-side">
          <div className="small muted" role="status" aria-live="polite">
            {state.over ? tr("done", { n: state.words.length }) : tr("left", { n: left })}
          </div>
          <ul className="wsearch-list">
            {state.words.map((w, k) => (
              <li key={w.key} className={state.found[k] ? "done" : ""}>
                {w.word}
                {state.found[k] && <span className="sr-only"> ({tr("found")})</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
