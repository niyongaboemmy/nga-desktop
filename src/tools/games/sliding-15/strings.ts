import type { GameStrings } from "../types";

export const strings: GameStrings = {
  en: {
    help: "Put the tiles back in order, 1 in the top left and the gap in the bottom right. Click a tile in the same row or column as the gap to slide it (and the tiles between) into the gap, or use the arrow keys to move a tile into the gap.",
    size3: "3 × 3", size4: "4 × 4",
    moves: "Moves", time: "Time", new: "New puzzle",
    solved: "Solved in {n} moves.",
    board: "Sliding tiles board", tile: "Tile {n}",
  },
  fr: {
    help: "Remettez les tuiles dans l'ordre, le 1 en haut à gauche et la case vide en bas à droite. Cliquez sur une tuile de la même ligne ou colonne que la case vide pour la faire glisser (avec les tuiles entre les deux), ou utilisez les flèches pour pousser une tuile dans la case vide.",
    size3: "3 × 3", size4: "4 × 4",
    moves: "Coups", time: "Temps", new: "Nouveau puzzle",
    solved: "Résolu en {n} coups.",
    board: "Plateau du taquin", tile: "Tuile {n}",
  },
  rw: {
    help: "Subiza uduce mu buryo bukurikirana, 1 hejuru ibumoso n'umwanya urimo ubusa hasi iburyo. Kanda ku gace kari ku murongo umwe cyangwa inkingi imwe n'umwanya urimo ubusa kugira ngo ugasunike (hamwe n'uduce turi hagati), cyangwa ukoreshe imyambi wimurire agace mu mwanya urimo ubusa.",
    size3: "3 × 3", size4: "4 × 4",
    moves: "Intambwe", time: "Igihe", new: "Igisakuzo gishya",
    solved: "Wabikemuye mu ntambwe {n}.",
    board: "Ikibaho cy'uduce tunyerera", tile: "Agace {n}",
  },
};
