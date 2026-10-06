// Typing tutor: keyboard lessons row by row, then a one-minute speed test. Pure.
import { rng, shuffle } from "../seed";

export interface Lesson {
  id: string;
  /** Letters this lesson practises (words are drawn only from letters learnt so far). */
  keys: string;
}

/** Each lesson adds keys; drills use every key learnt so far. */
export const LESSONS: Lesson[] = [
  { id: "home", keys: "asdfjkl" },
  { id: "homeMore", keys: "gh" },
  { id: "top", keys: "eiru" },
  { id: "topMore", keys: "otwyqp" },
  { id: "bottom", keys: "nmcv" },
  { id: "bottomMore", keys: "bxz" },
  { id: "caps", keys: "ABCDEFGHIJKLMNOPQRSTUVWXYZ.," },
  { id: "numbers", keys: "0123456789" },
];

const WORDS = `a ad add ads all as ask asks dad dads fad fall falls flask flag glad glass half hall has had hash lad lads lag sad salad sash shall jag
egg fig gift hike hill hide her here hire his jar judge red ride rise rush sure use user dish fish fresh higher fudge fur
the to too toy two tree try type write water way wait what when where who why yes you your pot top stop post port quite quiet paper
man men many name new nine now one oven move moon camp come cold can cave vote very voice science music summer animal mind
box boxes zero zebra brave above maize next taxi bus bus about better book number`.split(/\s+/);

/** The keys learnt up to and including lesson i (lowercase letters). */
export const knownKeys = (i: number) => new Set(LESSONS.slice(0, i + 1).flatMap((l) => [...l.keys.toLowerCase()]).filter((c) => /[a-z]/.test(c)));

/** A drill line for lesson i: real words using only known keys, plus key pairs for the new keys. */
export function drill(i: number, seed: number, words = 14): string {
  const r = rng(seed);
  const lesson = LESSONS[Math.max(0, Math.min(LESSONS.length - 1, i))];
  if (lesson.id === "numbers") {
    return Array.from({ length: words }, () => String(Math.floor(r() * 9000) + 10)).join(" ");
  }
  const known = knownKeys(Math.min(i, 5));
  let pool = WORDS.filter((w) => [...w].every((c) => known.has(c)));
  if (pool.length < 6) pool = [...pool, ...[...known].map((k) => k + k + k)];
  const fresh = [...lesson.keys.toLowerCase()].filter((c) => /[a-z]/.test(c));
  const out: string[] = [];
  for (let n = 0; n < words; n++) {
    if (fresh.length && n % 4 === 0 && lesson.id !== "caps") {
      const k = fresh[Math.floor(r() * fresh.length)];
      out.push(k + k + (fresh[Math.floor(r() * fresh.length)] ?? k));
    } else out.push(pool[Math.floor(r() * pool.length)]);
  }
  if (lesson.id === "caps") {
    // Sentences: a capital to start, a full stop or comma to end.
    return shuffle(out, r)
      .reduce<string[]>((acc, w, n) => [...acc, n % 5 === 0 ? w[0].toUpperCase() + w.slice(1) : w], [])
      .map((w, n, a) => (n % 5 === 4 || n === a.length - 1 ? `${w}.` : n % 5 === 2 ? `${w},` : w))
      .join(" ");
  }
  return out.join(" ");
}

export type TestLang = "en" | "fr" | "rw";

/** Speed-test passages: school life, original text. */
export const PASSAGES: Record<TestLang, string[]> = {
  en: [
    "Every morning the school bell rings at eight. Students walk to their classes, open their books and get ready to learn something new.",
    "Water boils at one hundred degrees Celsius at sea level. On a high mountain it boils at a lower temperature because the air pressure is lower.",
    "A good study plan is simple. Review your notes the same day, test yourself the next week, and ask questions when something is not clear.",
    "Rwanda is known as the land of a thousand hills. Its green valleys, lakes and forests are home to rare animals such as mountain gorillas.",
    "Plants make their own food through photosynthesis. They use sunlight, water and carbon dioxide, and they give out the oxygen we breathe.",
    "Teamwork means listening to others, sharing ideas and helping each member do their best. Many great projects begin with a small group.",
  ],
  fr: [
    "Chaque matin, la cloche sonne à huit heures. Les élèves entrent en classe, ouvrent leurs cahiers et se préparent à apprendre.",
    "Le Rwanda est appelé le pays des mille collines. Ses vallées, ses lacs et ses forêts abritent des animaux rares comme les gorilles.",
    "Pour bien réviser, il faut relire ses notes le jour même, se tester la semaine suivante et poser des questions quand on ne comprend pas.",
    "Les plantes fabriquent leur nourriture grâce à la photosynthèse. Elles utilisent la lumière, l'eau et le dioxyde de carbone.",
    "Travailler en équipe, c'est écouter les autres, partager ses idées et aider chacun à donner le meilleur de lui-même.",
  ],
  rw: [
    "Buri gitondo inzogera y'ishuri ivuga saa mbiri. Abanyeshuri binjira mu mashuri, bafungura amakaye yabo kandi bitegura kwiga.",
    "Amazi ni ubuzima. Tugomba kuyabungabunga, kuyanywa ari meza no kutayapfusha ubusa mu rugo no ku ishuri.",
    "U Rwanda ni igihugu cy'imisozi igihumbi. Gifite ibiyaga, amashyamba n'inyamaswa nyinshi nk'ingagi zo mu birunga.",
    "Gukorera hamwe bisaba kumva abandi, gusangira ibitekerezo no gufasha buri wese gukora neza.",
  ],
};

/** A long enough text for a one-minute test (passages in a seeded order). */
export function testText(lang: TestLang, seed: number): string {
  return shuffle(PASSAGES[lang], rng(seed)).join(" ");
}

export interface Stats {
  correct: number;
  errors: number;
  /** 0–100 */
  accuracy: number;
  /** Words per minute: correct characters / 5 per minute. */
  wpm: number;
}

/** Compares what was typed with the target, position by position. */
export function stats(target: string, typed: string, seconds: number): Stats {
  let correct = 0;
  for (let i = 0; i < typed.length; i++) if (typed[i] === target[i]) correct++;
  const errors = typed.length - correct;
  const accuracy = typed.length ? Math.round((correct / typed.length) * 100) : 100;
  const wpm = seconds > 0 ? Math.round(correct / 5 / (seconds / 60)) : 0;
  return { correct, errors, accuracy, wpm };
}

export const TEST_SECONDS = 60;

export interface State {
  mode: "lesson" | "test";
  lesson: number;
  lang: TestLang;
  target: string;
  typed: string;
  /** Seconds typed so far (counted only after the first key, while not paused). */
  elapsed: number;
  done: boolean;
  /** Lessons finished with ≥ 90 % accuracy. */
  passed: number[];
  seed: number;
}

export function newState(seed: number, lang: TestLang, mode: State["mode"] = "lesson", lesson = 0, passed: number[] = []): State {
  return { mode, lesson, lang, target: mode === "lesson" ? drill(lesson, seed) : testText(lang, seed), typed: "", elapsed: 0, done: false, passed, seed };
}

/** The next typed value (capped to the target); a lesson ends at its last character. */
export function type(s: State, value: string): State {
  if (s.done) return s;
  const typed = value.slice(0, s.target.length);
  const done = s.mode === "lesson" && typed.length >= s.target.length;
  const passed = done && stats(s.target, typed, s.elapsed).accuracy >= 90 && !s.passed.includes(s.lesson) ? [...s.passed, s.lesson] : s.passed;
  return { ...s, typed, done, passed };
}

/** One second of typing; the speed test ends after a minute. */
export function tick(s: State): State {
  if (s.done || !s.typed.length) return s;
  const elapsed = s.elapsed + 1;
  return { ...s, elapsed, done: s.mode === "test" && elapsed >= TEST_SECONDS };
}
