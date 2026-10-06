import { useMemo, useState } from "react";
import { ArrowLeft, BookOpenCheck, Plus, Trash2, Upload } from "lucide-react";
import { newCard, newId, parseCards, preview, queue, review, shortInterval, stats, type Deck, type Rate } from "./cards";
import { render } from "../notes/noteModel";
import { usePersonal } from "../shared/store";
import type { ToolProps } from "../types";
import type { Translate } from "../i18n";

const RATES: Array<{ r: Rate; key: "cards.again" | "cards.hard" | "cards.good" | "cards.easy" }> = [
  { r: "again", key: "cards.again" }, { r: "hard", key: "cards.hard" }, { r: "good", key: "cards.good" }, { r: "easy", key: "cards.easy" },
];

export default function Flashcards({ ctx }: ToolProps) {
  const { t, identity } = ctx;
  const [decks, setDecks, ready] = usePersonal<Deck[]>(identity, "cards.decks", []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<"deck" | "study">("deck");
  const deck = decks.find((d) => d.id === openId) ?? null;
  const update = (d: Deck) => setDecks((list) => list.map((x) => (x.id === d.id ? d : x)));

  if (!ready) return null;
  if (deck && mode === "study") return <Study deck={deck} t={t} onDone={() => setMode("deck")} onUpdate={update} />;
  if (deck) return <DeckView deck={deck} t={t} onBack={() => setOpenId(null)} onStudy={() => setMode("study")} onUpdate={update} onDelete={() => { setDecks((l) => l.filter((d) => d.id !== deck.id)); setOpenId(null); }} />;
  return (
    <div className="cards">
      <div className="row">
        <button className="btn sm primary" onClick={() => {
          const d: Deck = { id: newId(), name: t("cards.newDeckName", { n: decks.length + 1 }), cards: [], createdAt: Date.now() };
          setDecks((l) => [...l, d]);
          setOpenId(d.id);
        }}><Plus size={14} /> {t("cards.newDeck")}</button>
      </div>
      {decks.length === 0 ? (
        <div className="empty"><BookOpenCheck size={26} className="muted" /><p><strong>{t("cards.empty")}</strong></p><p className="muted small" style={{ maxWidth: 380, textAlign: "center" }}>{t("cards.why")}</p></div>
      ) : (
        <ul className="deck-list">
          {decks.map((d) => {
            const s = stats(d);
            return (
              <li key={d.id}>
                <button onClick={() => setOpenId(d.id)}>
                  <strong>{d.name}</strong>
                  <span className="muted small">{t("cards.counts", { total: s.total, due: s.due, new: s.new })}</span>
                  {s.due + Math.min(s.new, 20) > 0 && <span className="deck-due">{s.due + Math.min(s.new, 20)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DeckView({ deck, t, onBack, onStudy, onUpdate, onDelete }: {
  deck: Deck; t: Translate; onBack: () => void; onStudy: () => void; onUpdate: (d: Deck) => void; onDelete: () => void;
}) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [bulk, setBulk] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const s = stats(deck);
  const todo = queue(deck).length;
  return (
    <div className="cards">
      <div className="notes-bar">
        <button className="icon-btn" onClick={onBack} aria-label={t("cards.allDecks")}><ArrowLeft size={16} /></button>
        <input className="deck-name" value={deck.name} onChange={(e) => onUpdate({ ...deck, name: e.target.value })} aria-label={t("cards.deckName")} />
        <button className="icon-btn" onClick={() => setConfirm(true)} aria-label={t("notes.delete")}><Trash2 size={15} /></button>
      </div>
      {confirm && (
        <div className="confirm" role="alertdialog"><span>{t("cards.confirmDelete")}</span><button className="btn sm danger" onClick={onDelete}>{t("notes.delete")}</button><button className="btn sm" onClick={() => setConfirm(false)}>{t("common.cancel")}</button></div>
      )}
      <div className="result-cards">
        <div className="result-card big"><strong>{todo}</strong><span>{t("cards.toStudy")}</span></div>
        <div className="result-card"><strong>{s.learned}/{s.total}</strong><span>{t("cards.learned")}</span></div>
      </div>
      <button className="btn primary" disabled={!todo} onClick={onStudy}><BookOpenCheck size={15} /> {todo ? t("cards.study", { n: todo }) : t("cards.allDone")}</button>
      {bulk === null ? (
        <form className="card-add" onSubmit={(e) => {
          e.preventDefault();
          if (!front.trim() || !back.trim()) return;
          onUpdate({ ...deck, cards: [...deck.cards, newCard(front, back)] });
          setFront(""); setBack("");
        }}>
          <input value={front} onChange={(e) => setFront(e.target.value)} placeholder={t("cards.front")} aria-label={t("cards.front")} />
          <input value={back} onChange={(e) => setBack(e.target.value)} placeholder={t("cards.back")} aria-label={t("cards.back")} />
          <button className="btn sm" type="submit" disabled={!front.trim() || !back.trim()}><Plus size={13} /> {t("cards.add")}</button>
          <button type="button" className="btn sm" onClick={() => setBulk("")}><Upload size={13} /> {t("cards.paste")}</button>
        </form>
      ) : (
        <div className="list-editor">
          <textarea rows={6} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={t("cards.pasteHint")} />
          <div className="row">
            <button className="btn sm primary" disabled={!parseCards(bulk).length} onClick={() => { onUpdate({ ...deck, cards: [...deck.cards, ...parseCards(bulk).map((c) => newCard(c.front, c.back))] }); setBulk(null); }}>{t("cards.import", { n: parseCards(bulk).length })}</button>
            <button className="btn sm" onClick={() => setBulk(null)}>{t("common.cancel")}</button>
          </div>
        </div>
      )}
      <ul className="card-list">
        {deck.cards.map((c) => (
          <li key={c.id}>
            <span>{c.front}</span><span className="muted">{c.back}</span>
            <button className="icon-btn" onClick={() => onUpdate({ ...deck, cards: deck.cards.filter((x) => x.id !== c.id) })} aria-label={t("notes.delete")}><Trash2 size={13} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Study({ deck, t, onDone, onUpdate }: { deck: Deck; t: Translate; onDone: () => void; onUpdate: (d: Deck) => void }) {
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const q = useMemo(() => queue(deck), [deck]);
  const card = q[0];
  if (!card)
    return (
      <div className="empty study-done">
        <span className="big-emoji">🎉</span>
        <p><strong>{t("cards.finished", { n: done })}</strong></p>
        <p className="muted small">{t("cards.comeBack")}</p>
        <button className="btn" onClick={onDone}>{t("cards.back2deck")}</button>
      </div>
    );
  const next = preview(card);
  const rate = (r: Rate) => {
    onUpdate({ ...deck, cards: deck.cards.map((c) => (c.id === card.id ? review(c, r) : c)) });
    setShown(false);
    setDone((n) => n + 1);
  };
  return (
    <div className="study" onKeyDown={(e) => {
      if (!shown && (e.key === " " || e.key === "Enter")) { e.preventDefault(); setShown(true); }
      else if (shown && ["1", "2", "3", "4"].includes(e.key)) rate(RATES[Number(e.key) - 1].r);
    }} tabIndex={-1}>
      <div className="study-top"><button className="icon-btn" onClick={onDone} aria-label={t("cards.back2deck")}><ArrowLeft size={16} /></button><span className="muted small">{t("cards.left", { n: q.length })}</span></div>
      <button className={`flash${shown ? " flipped" : ""}`} onClick={() => setShown(true)} autoFocus>
        <div className="flash-front ai-md" dangerouslySetInnerHTML={{ __html: render(card.front) }} />
        {shown && <div className="flash-back ai-md" dangerouslySetInnerHTML={{ __html: render(card.back) }} />}
        {!shown && <span className="muted small">{t("cards.reveal")}</span>}
      </button>
      {shown && (
        <div className="rates">
          {RATES.map(({ r, key }, i) => (
            <button key={r} className={`rate-${r}`} onClick={() => rate(r)}>
              <strong>{t(key)}</strong><span>{shortInterval(next[r])}</span><kbd>{i + 1}</kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
