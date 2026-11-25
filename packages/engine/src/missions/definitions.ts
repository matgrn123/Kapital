import type { DefinitionMission, IdMission } from "./types.js";

export const DEFINITIONS_MISSIONS: readonly DefinitionMission[] = [
  {
    id: "mission1",
    numero: 1,
    titre: "Vendre ma première pièce sans perdre d'argent",
    objectif: "Vendre 50 pièces avec une marge brute positive.",
    notion: "Coût de revient et marge brute",
    explication:
      "Le coût de revient d'une pièce, c'est tout ce qu'elle coûte avant d'être vendue : la matière, le travail, une part des frais fixes. La marge brute, c'est ce qu'il reste entre le prix de vente HT et ce coût de revient. Tant qu'elle est positive, chaque pièce vendue rapporte.",
  },
  {
    id: "mission2",
    numero: 2,
    titre: "Tenir six mois",
    objectif: "Ne jamais passer sous zéro de trésorerie pendant 6 mois de jeu.",
    notion: "Trésorerie et frais fixes",
    explication:
      "La trésorerie, c'est l'argent disponible sur le compte, pas le bénéfice. Les frais fixes (loyer, salaires, cotisations) tombent chaque mois, même sans vente. Tenir six mois sans découvert, c'est garder une trésorerie supérieure aux frais fixes à venir.",
  },
  {
    id: "mission3",
    numero: 3,
    titre: "Survivre à la croissance",
    objectif: "Doubler le chiffre d'affaires mensuel sans découvert.",
    notion: "Besoin en fonds de roulement",
    explication:
      "Vendre plus oblige à acheter plus de matière et à payer plus de façonniers avant d'encaisser les ventes. C'est le besoin en fonds de roulement : l'argent immobilisé dans le cycle d'exploitation. Une croissance rapide sans trésorerie suffisante conduit au découvert malgré des ventes qui montent.",
  },
  {
    id: "mission4",
    numero: 4,
    titre: "Ouvrir ma boutique sans découvert",
    objectif:
      "Ouvrir une boutique sans que la trésorerie passe sous zéro, du mois de la signature du bail jusqu'à la fin du premier mois d'ouverture.",
    notion: "Bail commercial et point mort",
    explication:
      "Ouvrir une boutique fait sortir beaucoup d'argent d'un coup : le dépôt de garantie du bail commercial (il reste à l'actif et te sera rendu en partant) et les travaux d'agencement (une immobilisation, amortie sur plusieurs années). Ensuite, chaque mois, le loyer, les charges et le salaire du vendeur tombent, même pendant les travaux, quand la boutique ne vend encore rien. Le point mort, c'est le chiffre d'affaires mensuel à partir duquel la marge couvre ces charges fixes. Pour ouvrir sans découvert, il faut garder de quoi tenir jusqu'à ce que la boutique l'atteigne.",
  },
  {
    id: "mission5",
    numero: 5,
    titre: "Louer ou acheter",
    objectif: "Comparer la location et l'achat d'un local sur l'écran Locaux, puis signer un bail ou l'acheter.",
    notion: "Louer ou acheter : le levier de la dette",
    explication:
      "Louer, c'est payer un loyer chaque mois : une charge, mais l'argent reste en banque. Acheter, c'est verser un apport et emprunter le reste : le local entre à l'actif, il s'use (l'amortissement) et les intérêts du prêt sont une charge. Le comparatif additionne ce qui est vraiment perdu dans les deux cas. La dette est un levier : elle amplifie les gains quand l'activité marche, et les pertes quand elle ralentit, parce que la mensualité tombe quoi qu'il arrive.",
  },
];

export function definitionParId(id: IdMission): DefinitionMission {
  const d = DEFINITIONS_MISSIONS.find((m) => m.id === id);
  if (!d) throw new Error(`Mission inconnue : ${id}`);
  return d;
}
