import type { GameStrings } from "../types";

export const strings: GameStrings = {
  en: {
    help: "Open every square that has no mine. A number tells how many mines touch that square. Left click (or Space) opens a square; right click (or F) puts a flag where you think a mine is. Click a number that has enough flags around it to open the rest of its neighbours. Your first click is always safe.",
    small: "9 × 9", medium: "12 × 12", large: "16 × 16",
    flags: "Mines left", time: "Time", new: "New game", again: "Try again",
    won: "Cleared in {s} seconds.",
    lost: "A mine. The other mines are shown.",
    board: "Mines board", hidden: "hidden", flagged: "flagged", mine: "mine", empty: "empty",
  },
  fr: {
    help: "Ouvrez toutes les cases sans mine. Un nombre indique combien de mines touchent cette case. Clic gauche (ou Espace) ouvre une case ; clic droit (ou F) pose un drapeau là où vous pensez qu'il y a une mine. Cliquez sur un nombre entouré d'assez de drapeaux pour ouvrir ses autres voisines. Votre premier clic est toujours sûr.",
    small: "9 × 9", medium: "12 × 12", large: "16 × 16",
    flags: "Mines restantes", time: "Temps", new: "Nouvelle partie", again: "Réessayer",
    won: "Terminé en {s} secondes.",
    lost: "Une mine. Les autres mines sont affichées.",
    board: "Plateau des mines", hidden: "cachée", flagged: "drapeau", mine: "mine", empty: "vide",
  },
  rw: {
    help: "Fungura utuzu twose tudafite mine. Umubare ukubwira mine zingahe zikora kuri ako kazu. Gukanda ibumoso (cyangwa Space) bifungura akazu; gukanda iburyo (cyangwa F) bishyira ibendera aho utekereza ko hari mine. Kanda ku mubare ufite amabendera ahagije hafi yawo kugira ngo ufungure utundi tuzu tuwukikije. Gukanda kwa mbere ntigushobora kugwa kuri mine.",
    small: "9 × 9", medium: "12 × 12", large: "16 × 16",
    flags: "Mine zisigaye", time: "Igihe", new: "Umukino mushya", again: "Ongera ugerageze",
    won: "Wabirangije mu masegonda {s}.",
    lost: "Wakandagiye kuri mine. Izindi mine zirerekanywe.",
    board: "Ikibaho cya mine", hidden: "gihishe", flagged: "gifite ibendera", mine: "mine", empty: "ubusa",
  },
};
