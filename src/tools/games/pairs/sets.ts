// Themed pair sets. A label may differ by language (missing languages fall back to English).
import type { Lang } from "../../i18n";

export type Label = string | Partial<Record<Lang, string>> & { en: string };
export type ShapeId = "circle" | "square" | "triangle" | "star" | "heart" | "diamond" | "hexagon" | "pentagon" | "cross" | "ring" | "crescent" | "arrow";

export interface PairItem {
  a: Label;
  /** The matching card; for shapes both cards show the same picture. */
  b: Label;
  shape?: { id: ShapeId; color: string };
}

export type SetId = "elements" | "words" | "capitals" | "shapes";
export const SET_IDS: SetId[] = ["elements", "words", "capitals", "shapes"];

export const label = (l: Label, lang: Lang): string => (typeof l === "string" ? l : l[lang] ?? l.en);

const el = (en: string, sym: string, fr?: string): PairItem => ({ a: fr ? { en, fr } : en, b: sym });

const ELEMENTS: PairItem[] = [
  el("Hydrogen", "H", "Hydrogène"), el("Helium", "He", "Hélium"), el("Lithium", "Li"), el("Carbon", "C", "Carbone"),
  el("Nitrogen", "N", "Azote"), el("Oxygen", "O", "Oxygène"), el("Fluorine", "F", "Fluor"), el("Neon", "Ne", "Néon"),
  el("Sodium", "Na"), el("Magnesium", "Mg", "Magnésium"), el("Aluminium", "Al"), el("Silicon", "Si", "Silicium"),
  el("Phosphorus", "P", "Phosphore"), el("Sulfur", "S", "Soufre"), el("Chlorine", "Cl", "Chlore"), el("Argon", "Ar"),
  el("Potassium", "K"), el("Calcium", "Ca"), el("Iron", "Fe", "Fer"), el("Copper", "Cu", "Cuivre"),
  el("Zinc", "Zn"), el("Silver", "Ag", "Argent"), el("Gold", "Au", "Or"), el("Lead", "Pb", "Plomb"),
  el("Mercury", "Hg", "Mercure"), el("Tin", "Sn", "Étain"), el("Iodine", "I", "Iode"),
];

/** English ↔ Kinyarwanda: everyday words (the same in every interface language). */
const WORDS: PairItem[] = ([
  ["water", "amazi"], ["school", "ishuri"], ["book", "igitabo"], ["house", "inzu"], ["teacher", "mwarimu"],
  ["child", "umwana"], ["cow", "inka"], ["sun", "izuba"], ["moon", "ukwezi"], ["rain", "imvura"],
  ["tree", "igiti"], ["bread", "umugati"], ["milk", "amata"], ["food", "ibiryo"], ["dog", "imbwa"],
  ["goat", "ihene"], ["hand", "ukuboko"], ["head", "umutwe"], ["eye", "ijisho"], ["friend", "inshuti"],
  ["road", "umuhanda"], ["car", "imodoka"], ["fire", "umuriro"], ["stone", "ibuye"], ["chair", "intebe"],
  ["pen", "ikaramu"], ["day", "umunsi"], ["night", "ijoro"], ["money", "amafaranga"], ["bird", "inyoni"],
  ["person", "umuntu"], ["country", "igihugu"],
] as const).map(([a, b]) => ({ a, b }));

const cap = (country: Label, capital: Label): PairItem => ({ a: country, b: capital });

const CAPITALS: PairItem[] = [
  cap("Rwanda", "Kigali"),
  cap("Burundi", "Gitega"),
  cap({ en: "Tanzania", fr: "Tanzanie", rw: "Tanzaniya" }, "Dodoma"),
  cap("Kenya", "Nairobi"),
  cap({ en: "Uganda", fr: "Ouganda" }, "Kampala"),
  cap({ en: "DR Congo", fr: "RD Congo", rw: "RD Kongo" }, "Kinshasa"),
  cap({ en: "Ethiopia", fr: "Éthiopie", rw: "Etiyopiya" }, { en: "Addis Ababa", fr: "Addis-Abeba" }),
  cap("Nigeria", "Abuja"),
  cap("Ghana", "Accra"),
  cap({ en: "Senegal", fr: "Sénégal", rw: "Senegali" }, "Dakar"),
  cap({ en: "Egypt", fr: "Égypte", rw: "Misiri" }, { en: "Cairo", fr: "Le Caire" }),
  cap({ en: "South Africa", fr: "Afrique du Sud", rw: "Afurika y'Epfo" }, "Pretoria"),
  cap({ en: "Morocco", fr: "Maroc" }, "Rabat"),
  cap({ en: "Cameroon", fr: "Cameroun", rw: "Kameruni" }, "Yaoundé"),
  cap({ en: "Zambia", fr: "Zambie", rw: "Zambiya" }, "Lusaka"),
  cap("Zimbabwe", "Harare"),
  cap("Malawi", "Lilongwe"),
  cap("Mozambique", "Maputo"),
  cap("Angola", "Luanda"),
  cap({ en: "South Sudan", fr: "Soudan du Sud", rw: "Sudani y'Epfo" }, "Juba"),
  cap("Mali", "Bamako"),
  cap("Botswana", "Gaborone"),
  cap({ en: "Namibia", fr: "Namibie", rw: "Namibiya" }, "Windhoek"),
  cap({ en: "France", rw: "Ubufaransa" }, "Paris"),
  cap({ en: "Japan", fr: "Japon", rw: "Ubuyapani" }, "Tokyo"),
  cap({ en: "China", fr: "Chine", rw: "Ubushinwa" }, { en: "Beijing", fr: "Pékin" }),
  cap({ en: "Brazil", fr: "Brésil", rw: "Burezili" }, "Brasília"),
  cap("Canada", "Ottawa"),
  cap({ en: "India", fr: "Inde", rw: "Ubuhinde" }, "New Delhi"),
  cap({ en: "United Kingdom", fr: "Royaume-Uni", rw: "Ubwongereza" }, { en: "London", fr: "Londres" }),
  cap({ en: "Germany", fr: "Allemagne", rw: "Ubudage" }, "Berlin"),
];

const sh = (id: ShapeId, color: string, name: Label): PairItem => ({ a: name, b: name, shape: { id, color } });

const SHAPES: PairItem[] = [
  sh("circle", "#ef4444", { en: "Red circle", fr: "Cercle rouge", rw: "Uruziga rutukura" }),
  sh("square", "#3b82f6", { en: "Blue square", fr: "Carré bleu", rw: "Kare y'ubururu" }),
  sh("triangle", "#22c55e", { en: "Green triangle", fr: "Triangle vert", rw: "Mpandeshatu y'icyatsi" }),
  sh("star", "#eab308", { en: "Yellow star", fr: "Étoile jaune", rw: "Inyenyeri y'umuhondo" }),
  sh("heart", "#ec4899", { en: "Pink heart", fr: "Cœur rose", rw: "Umutima w'iroza" }),
  sh("diamond", "#a855f7", { en: "Purple diamond", fr: "Losange violet" }),
  sh("hexagon", "#f97316", { en: "Orange hexagon", fr: "Hexagone orange" }),
  sh("pentagon", "#14b8a6", { en: "Teal pentagon", fr: "Pentagone turquoise" }),
  sh("cross", "#64748b", { en: "Grey cross", fr: "Croix grise" }),
  sh("ring", "#0ea5e9", { en: "Sky-blue ring", fr: "Anneau bleu ciel" }),
  sh("crescent", "#f59e0b", { en: "Gold crescent", fr: "Croissant doré", rw: "Ukwezi" }),
  sh("arrow", "#84cc16", { en: "Lime arrow", fr: "Flèche vert clair" }),
];

export const SETS: Record<SetId, PairItem[]> = { elements: ELEMENTS, words: WORDS, capitals: CAPITALS, shapes: SHAPES };
