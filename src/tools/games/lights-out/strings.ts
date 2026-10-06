import type { GameStrings } from "../types";

export const strings: GameStrings = {
  en: {
    help: "Switch every light off. Pressing a square flips it and the squares above, below, left and right of it. Click a square, or move with the arrow keys and press Space or Enter. Stuck? Ask for a hint.",
    easy: "Easy", medium: "Medium", hard: "Hard",
    moves: "Moves", time: "Time",
    hint: "Hint", restart: "Start again", new: "New puzzle",
    solved: "All lights off in {n} moves.",
    board: "Lights out board", lit: "on", unlit: "off",
  },
  fr: {
    help: "Éteignez toutes les lumières. Appuyer sur une case l'inverse, ainsi que les cases au-dessus, en dessous, à gauche et à droite. Cliquez sur une case, ou déplacez-vous avec les flèches et appuyez sur Espace ou Entrée. Bloqué ? Demandez un indice.",
    easy: "Facile", medium: "Moyen", hard: "Difficile",
    moves: "Coups", time: "Temps",
    hint: "Indice", restart: "Recommencer", new: "Nouveau puzzle",
    solved: "Toutes les lumières éteintes en {n} coups.",
    board: "Plateau des lumières", lit: "allumée", unlit: "éteinte",
  },
  rw: {
    help: "Zimya amatara yose. Gukanda akazu bihindura ako kazu n'utuzu turi hejuru, hasi, ibumoso n'iburyo bwako. Kanda ku kazu, cyangwa ugende ukoresheje imyambi hanyuma ukande Space cyangwa Enter. Wayobewe? Saba inama.",
    easy: "Byoroshye", medium: "Biringaniye", hard: "Bikomeye",
    moves: "Intambwe", time: "Igihe",
    hint: "Inama", restart: "Ongera utangire", new: "Igisakuzo gishya",
    solved: "Amatara yose yazimye mu ntambwe {n}.",
    board: "Ikibaho cy'amatara", lit: "ryaka", unlit: "ryazimye",
  },
};
