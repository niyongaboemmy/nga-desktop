import type { GameStrings } from "../types";

export const strings: GameStrings = {
  en: {
    help: "Find the hidden picture. The numbers beside each row and above each column give the lengths of the runs of filled squares in that line, in order, with at least one empty square between runs. Left click fills a square; right click (or X) marks it as empty. Drag to paint along a line. With the keyboard: arrow keys move, Space fills, X marks. A clue fades once its line matches. Every puzzle can be solved by reasoning, without guessing.",
    daily: "Daily", size5: "5 × 5", size10: "10 × 10", size15: "15 × 15",
    time: "Time", clear: "Clear", new: "New picture",
    solved: "Picture found in {t}.",
    board: "Picture logic grid", cell: "Row {r}, column {c}", filled: "filled", crossed: "marked empty", blank: "blank",
  },
  fr: {
    help: "Trouvez l'image cachée. Les nombres à côté de chaque ligne et au-dessus de chaque colonne donnent, dans l'ordre, les longueurs des suites de cases pleines de cette ligne, avec au moins une case vide entre deux suites. Clic gauche remplit une case ; clic droit (ou X) la marque comme vide. Faites glisser pour peindre le long d'une ligne. Au clavier : les flèches déplacent, Espace remplit, X marque. Un indice s'estompe quand sa ligne est juste. Chaque grille se résout par le raisonnement, sans deviner.",
    daily: "Du jour", size5: "5 × 5", size10: "10 × 10", size15: "15 × 15",
    time: "Temps", clear: "Effacer", new: "Nouvelle image",
    solved: "Image trouvée en {t}.",
    board: "Grille d'image logique", cell: "Ligne {r}, colonne {c}", filled: "remplie", crossed: "marquée vide", blank: "vierge",
  },
  rw: {
    help: "Shaka ishusho ihishe. Imibare iri iruhande rwa buri murongo no hejuru ya buri nkingi ivuga, uko ikurikirana, uburebure bw'utuzu twuzuye dukurikiranye kuri uwo murongo, hakaba nibura akazu kamwe karimo ubusa hagati yatwo. Gukanda ibumoso byuzuza akazu; gukanda iburyo (cyangwa X) bikagaragaza ko karimo ubusa. Kurura kugira ngo usige ku murongo. Ukoresheje clavier: imyambi iragenda, Space iruzuza, X iraranga. Ibimenyetso by'umurongo bicika intege iyo umurongo uhuye. Buri gisakuzo gikemurwa n'ubwenge, nta gukeka.",
    daily: "Cy'umunsi", size5: "5 × 5", size10: "10 × 10", size15: "15 × 15",
    time: "Igihe", clear: "Siba byose", new: "Ishusho nshya",
    solved: "Wabonye ishusho mu {t}.",
    board: "Ikibaho cy'ishusho", cell: "Umurongo {r}, inkingi {c}", filled: "cyuzuye", crossed: "kirimo ubusa", blank: "nta kintu",
  },
};
