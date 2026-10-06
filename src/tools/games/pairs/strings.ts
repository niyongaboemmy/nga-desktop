import type { GameStrings } from "../types";

export const strings: GameStrings = {
  en: {
    help: "Turn over two cards. If they belong together (an element and its symbol, a word and its Kinyarwanda meaning, a country and its capital, or two identical shapes), they stay face up. If not, remember where they are and try again. Use the mouse, or the arrow keys and Enter. With 2 players, a match gives you another turn.",
    elements: "Elements", words: "English ↔ Kinyarwanda", capitals: "Capitals", shapes: "Shapes",
    cards: "{n} cards", one: "1 player", two: "2 players",
    moves: "Moves", time: "Time", player: "Player {n}",
    turn: "Player {n}'s turn", won: "All pairs found in {n} moves!", winner: "Player {n} wins!", draw: "It's a draw!",
    card: "Card {n}", hidden: "face down",
  },
  fr: {
    help: "Retournez deux cartes. Si elles vont ensemble (un élément et son symbole, un mot et son sens en kinyarwanda, un pays et sa capitale, ou deux formes identiques), elles restent visibles. Sinon, retenez leur place et réessayez. Utilisez la souris, ou les flèches et Entrée. À 2 joueurs, une paire trouvée donne un tour de plus.",
    elements: "Éléments", words: "Anglais ↔ kinyarwanda", capitals: "Capitales", shapes: "Formes",
    cards: "{n} cartes", one: "1 joueur", two: "2 joueurs",
    moves: "Coups", time: "Temps", player: "Joueur {n}",
    turn: "Au tour du joueur {n}", won: "Toutes les paires trouvées en {n} coups !", winner: "Le joueur {n} gagne !", draw: "Égalité !",
    card: "Carte {n}", hidden: "face cachée",
  },
  rw: {
    help: "Hindura amakarita abiri. Niba ajyana (ikinyabutabire n'ikimenyetso cyacyo, ijambo n'igisobanuro cyaryo mu Kinyarwanda, igihugu n'umurwa mukuru wacyo, cyangwa amashusho abiri asa), aguma agaragara. Niba atajyana, ibuka aho ari wongere ugerageze. Koresha imbeba, cyangwa imyambi na Enter. Mu bakinnyi 2, ubonye ibisa yongera gukina.",
    elements: "Ibinyabutabire", words: "Icyongereza ↔ Ikinyarwanda", capitals: "Imirwa mikuru", shapes: "Amashusho",
    cards: "Amakarita {n}", one: "Umukinnyi 1", two: "Abakinnyi 2",
    moves: "Ingendo", time: "Igihe", player: "Umukinnyi {n}",
    turn: "Igihe cy'umukinnyi {n}", won: "Wabonye ibisa byose mu ngendo {n}!", winner: "Umukinnyi {n} aratsinze!", draw: "Banganya!",
    card: "Ikarita {n}", hidden: "ihindukiye",
  },
};
