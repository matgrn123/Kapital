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
];

export function definitionParId(id: IdMission): DefinitionMission {
  const d = DEFINITIONS_MISSIONS.find((m) => m.id === id);
  if (!d) throw new Error(`Mission inconnue : ${id}`);
  return d;
}
