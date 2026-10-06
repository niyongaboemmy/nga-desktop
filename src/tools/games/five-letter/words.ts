// Curated answer lists: common, school-level, five letters, plain a–z (French answers carry no accents;
// typed accents are removed before comparing). Guesses need not be in these lists.
import type { Lang } from "../../i18n";

const list = (s: string) => s.trim().split(/\s+/);

const EN = list(`
about above after again alone among angle apple argue award beach begin below birds black blood board
brain bread brick brush build cable camel carry catch chair chalk chess chest child class clean clear
climb clock close cloud coast count cover cream dance dream drink early earth eight equal extra field
fifty final first floor flour focus force forty frame fresh front fruit giant glass globe grade grain
grape grass great green group guess guide happy heart heavy honey horse hotel house human image juice
knife laugh layer learn lemon level light lunch magic mango march metal minus model money month motor
mouse mouth music night noise north ocean offer onion paint paper party peace phone photo piano place
plane plant plate point power prize quiet radio raise ratio reach ready river robot rough round ruler
salad scale score sense shape share sheep shelf shirt short skill sleep small smile snake solid solve
sound south space spoon sport stand start steam stone story study sugar sunny sweet table taste teach
thank thick think three tiger today tooth torch total touch tower train treat trees truck trust truth
uncle union unity value video visit voice watch water whale wheat wheel white whole world write young zebra
`);

const FR = list(`
livre table porte plage arbre fleur pomme poire salle cours carte stylo sucre chien poule vache lapin
singe tigre corps jambe coude ongle dents nuage pluie neige monde terre ville route train avion sport
danse chant piano radio image photo herbe champ ferme sable roche fruit melon huile verre tasse lampe
gomme texte verbe ligne point angle somme total moins heure temps jours matin hiver lundi mardi jeudi
oncle tante femme homme fille salut merci bravo rouge jaune blanc grise verte noire beige calme douce
froid chaud petit grand large court haute basse belle jolie bonne lente vieux jeune forte libre juste
plein aller venir faire jouer boire nager aimer finir poser tenir lever laver tirer aider jeter plier
noter voter peser durer semer cuire globe atome force masse acide bruit objet outil robot virus crabe
hibou aigle biche panda koala prune olive repas colle craie bancs piste balle match chose place orage
brume glace plume patte queue corne
`);

// Real, everyday Kinyarwanda words of exactly five letters (nouns, a few verbs and adjectives).
const RW = list(`
amazi amata ihene imbwa igiti izuba ibuye ijoro umuti amafi imana inama ikawa isuka amaso isaha ibiti
igare ubuki ikara ibara uruzi ameza ikaye urugo abana izuru isoko iduka ibaba ikote icupa ijuru ibabi
umuzi imizi amagi isazi umubu inuma isomo inkwi agati akazi ukuri rimwe icumi ijana cyane byiza mwiza
kurya kwiga kujya kumva kwoga amavi umuco itara isuku ifoto ibiro uburo amano ijosi ikime igicu ibicu
`);

export const ANSWERS: Record<Lang, string[]> = { en: EN, fr: FR, rw: RW };

/** Rows of the on-screen keyboard (AZERTY for French). */
export const KEY_ROWS: Record<Lang, string[]> = {
  en: ["qwertyuiop", "asdfghjkl", "zxcvbnm"],
  fr: ["azertyuiop", "qsdfghjklm", "wxcvbn"],
  rw: ["qwertyuiop", "asdfghjkl", "zxcvbnm"],
};
