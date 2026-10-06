// Subject word packs. Words are shown as written (with accents); the grid uses plain capitals.
// Every word is one word of at most 10 letters, so it fits a 10×10 grid.
import type { Lang } from "../../i18n";

export interface Pack {
  id: string;
  /** The pack's name in each language it exists in. */
  name: Partial<Record<Lang, string>>;
  words: Partial<Record<Lang, string[]>>;
}

const w = (s: string) => s.trim().split(/\s+/);

export const PACKS: Pack[] = [
  {
    id: "biology",
    name: { en: "Biology", fr: "Biologie", rw: "Umubiri w'umuntu" },
    words: {
      en: w("cell heart blood lungs brain bone muscle nerve enzyme protein gene tissue organ leaf root"),
      fr: w("cellule sang organe muscle poumon racine feuille graine plante insecte oiseau nerf"),
      rw: w("umutima amaraso igufwa ururimi ubwonko igifu umwijima ibihaha uruhu amenyo umubiri imitsi"),
    },
  },
  {
    id: "animals",
    name: { rw: "Inyamaswa" },
    words: {
      rw: w("inka ihene intama imbwa injangwe inkoko intare inzovu ingagi imparage inzoka inyoni"),
    },
  },
  {
    id: "chemistry",
    name: { en: "Chemistry", fr: "Chimie" },
    words: {
      en: w("atom acid base salt ion metal oxygen carbon element molecule gas liquid solid bond"),
      fr: w("atome acide base sel gaz métal liquide solide molécule oxygène carbone fer"),
    },
  },
  {
    id: "physics",
    name: { en: "Physics", fr: "Physique" },
    words: {
      en: w("force mass energy speed wave light heat magnet current voltage pressure lever gravity"),
      fr: w("force masse vitesse énergie onde lumière chaleur aimant courant tension pression levier"),
    },
  },
  {
    id: "geography",
    name: { en: "Geography", fr: "Géographie", rw: "Ubumenyi bw'isi" },
    words: {
      en: w("mountain river lake ocean forest desert volcano valley plateau climate map equator savanna"),
      fr: w("montagne rivière lac océan forêt désert volcan savane colline plaine climat carte"),
      rw: w("umusozi ikiyaga uruzi inyanja ishyamba ikirere imvura umuyaga igicu izuba ukwezi ubutaka"),
    },
  },
  {
    id: "maths",
    name: { en: "Maths", fr: "Mathématiques", rw: "Imibare" },
    words: {
      en: w("sum angle circle square triangle number fraction product radius prime matrix vector graph"),
      fr: w("somme angle cercle carré triangle nombre fraction produit quotient rayon droite égal"),
      rw: w("rimwe kabiri gatatu kane gatanu gatandatu karindwi umunani icyenda icumi ijana igihumbi"),
    },
  },
  {
    id: "computing",
    name: { en: "Computer science", fr: "Informatique" },
    words: {
      en: w("mouse keyboard screen file folder network software code byte data memory robot loop array"),
      fr: w("souris clavier écran fichier dossier réseau logiciel code octet donnée mémoire robot"),
    },
  },
];

/** Packs that exist in a language. */
export const packsFor = (lang: Lang) => PACKS.filter((p) => p.words[lang]?.length);
