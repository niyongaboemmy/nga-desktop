// Flashcards with spaced repetition (FSRS, the scheduler MIS e-learning uses).
// Pure, unit-tested: the UI stores decks per person and calls these.
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card as FsrsCard, type Grade } from "ts-fsrs";

export type Rate = "again" | "hard" | "good" | "easy";
const RATING: Record<Rate, Grade> = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };

/** An FSRS card as stored (dates as ISO strings). */
export type Stored = Omit<FsrsCard, "due" | "last_review"> & { due: string; last_review?: string | null };

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  srs: Stored;
}

export interface Deck {
  id: string;
  name: string;
  cards: Flashcard[];
  createdAt: number;
}

const scheduler = fsrs(generatorParameters({ enable_fuzz: false, request_retention: 0.9 }));

const toStored = (c: FsrsCard): Stored => ({ ...c, due: c.due.toISOString(), last_review: c.last_review ? c.last_review.toISOString() : null });
const fromStored = (s: Stored): FsrsCard => ({ ...s, due: new Date(s.due), last_review: s.last_review ? new Date(s.last_review) : undefined }) as FsrsCard;

let seq = 0;
export const newId = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newCard(front: string, back: string, now = new Date()): Flashcard {
  return { id: newId(), front: front.trim(), back: back.trim(), srs: toStored(createEmptyCard(now)) };
}

/** Rate a card; returns the card with its next review date. */
export function review(card: Flashcard, rate: Rate, now = new Date()): Flashcard {
  const next = scheduler.next(fromStored(card.srs), now, RATING[rate]);
  return { ...card, srs: toStored(next.card) };
}

/** When each rating would bring the card back (for the buttons: "10 min", "3 d"…). */
export function preview(card: Flashcard, now = new Date()): Record<Rate, number> {
  const out = {} as Record<Rate, number>;
  for (const r of Object.keys(RATING) as Rate[]) out[r] = scheduler.next(fromStored(card.srs), now, RATING[r]).card.due.getTime() - now.getTime();
  return out;
}

export const isDue = (c: Flashcard, now = Date.now()) => Date.parse(c.srs.due) <= now;
export const isNew = (c: Flashcard) => c.srs.reps === 0;

/** Today's queue: due cards first (most overdue), then up to `newLimit` new cards. */
export function queue(deck: Deck, now = Date.now(), newLimit = 20): Flashcard[] {
  const due = deck.cards.filter((c) => !isNew(c) && isDue(c, now)).sort((a, b) => a.srs.due.localeCompare(b.srs.due));
  const fresh = deck.cards.filter(isNew).slice(0, newLimit);
  return [...due, ...fresh];
}

export function stats(deck: Deck, now = Date.now()) {
  const fresh = deck.cards.filter(isNew).length;
  const due = deck.cards.filter((c) => !isNew(c) && isDue(c, now)).length;
  return { total: deck.cards.length, new: fresh, due, learned: deck.cards.length - fresh };
}

/** "3 min", "2 h", "4 d", "3 mo" for interval labels. */
export function shortInterval(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} d`;
  const mo = Math.round(d / 30);
  return mo < 12 ? `${mo} mo` : `${Math.round(d / 365)} y`;
}

/**
 * Cards from pasted text: one card per line, front and back separated by a tab,
 * " | ", " - " or " : " (the first one found). Lines without a separator are skipped.
 */
export function parseCards(text: string): Array<{ front: string; back: string }> {
  const out: Array<{ front: string; back: string }> = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const sep = ["\t", " | ", " - ", " : ", " = "].find((s) => line.includes(s));
    if (!sep) continue;
    const i = line.indexOf(sep);
    const front = line.slice(0, i).trim(), back = line.slice(i + sep.length).trim();
    if (front && back) out.push({ front, back });
  }
  return out.slice(0, 500);
}
