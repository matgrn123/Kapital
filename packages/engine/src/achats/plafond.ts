import { eurosTexte } from "../types/euros.js";

/**
 * Règle commune aux commandes payées à la livraison (tissu, façonnier, grossiste) :
 * quantité entière, au moins le minimum du fournisseur, et pas plus que ce que la
 * trésorerie du moment peut payer (décision du 25 novembre 2026, même règle que l'écran).
 */

/** Nombre d'unités que la trésorerie peut payer au prix donné (centimes). */
export function quantiteMaxPayable(tresorerie: number, prixUnitaire: number): number {
  if (prixUnitaire <= 0) return Number.POSITIVE_INFINITY;
  if (tresorerie <= 0) return 0;
  return Math.floor(tresorerie / prixUnitaire);
}

export type VerificationQuantite =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "quantite_invalide" | "sous_minimum" | "tresorerie_insuffisante";
      readonly message: string;
    };

export function verifierQuantiteCommande(e: {
  readonly quantite: number;
  readonly minimum: number;
  readonly prixUnitaire: number;
  readonly tresorerie: number;
}): VerificationQuantite {
  if (!Number.isInteger(e.quantite) || e.quantite <= 0) {
    return {
      ok: false,
      code: "quantite_invalide",
      message: "La quantité doit être un nombre entier de pièces, supérieur à zéro.",
    };
  }
  if (e.quantite < e.minimum) {
    return {
      ok: false,
      code: "sous_minimum",
      message: `Minimum du fournisseur : ${e.minimum}. Tu as demandé ${e.quantite}.`,
    };
  }
  const cout = e.quantite * e.prixUnitaire;
  if (cout > e.tresorerie) {
    const max = quantiteMaxPayable(e.tresorerie, e.prixUnitaire);
    return {
      ok: false,
      code: "tresorerie_insuffisante",
      message:
        `Trésorerie insuffisante : cette commande coûte ${eurosTexte(cout)}, tu as ${eurosTexte(e.tresorerie)}, ` +
        `il manque ${eurosTexte(cout - e.tresorerie)}. Tu peux commander au plus ${max.toLocaleString("fr-FR").replace(/\s/g, " ")}.`,
    };
  }
  return { ok: true };
}
