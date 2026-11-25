import type { Compte, EcritureComptable } from "../comptabilite/types.js";

/**
 * Totaux du mois, conservés d'un pas à l'autre à la place de la liste des écritures
 * (déjà enregistrées en base). Suffisants pour la clôture : TVA collectée, mouvements
 * de banque, produits et charges de l'exercice.
 */
export type AgregatsMois = {
  /** TVA collectée nette (compte 44571), en centimes. */
  readonly tvaCollectee: number;
  /** Mouvements nets de la banque (compte 512), en centimes. */
  readonly net512: number;
  /** Produits du mois (comptes de produits, crédit − débit), en centimes. */
  readonly produits: number;
  /** Charges du mois (comptes de charges, débit − crédit), en centimes. */
  readonly charges: number;
};

export const AGREGATS_VIDES: AgregatsMois = { tvaCollectee: 0, net512: 0, produits: 0, charges: 0 };

export function agregatsDe(
  ecritures: readonly EcritureComptable[],
  comptes: Readonly<Record<string, Compte>>,
): AgregatsMois {
  let tvaCollectee = 0;
  let net512 = 0;
  let produits = 0;
  let charges = 0;
  for (const ec of ecritures) {
    for (const l of ec.lignes) {
      const signe = l.sens === "debit" ? 1 : -1;
      if (l.compte === "44571") tvaCollectee -= signe * l.montant; // crédit = collectée
      if (l.compte === "512") net512 += signe * l.montant;
      const type = comptes[l.compte]?.type;
      if (type === "produits") produits -= signe * l.montant;
      else if (type === "charges") charges += signe * l.montant;
    }
  }
  return { tvaCollectee, net512, produits, charges };
}

export function sommeAgregats(a: AgregatsMois, b: AgregatsMois): AgregatsMois {
  return {
    tvaCollectee: a.tvaCollectee + b.tvaCollectee,
    net512: a.net512 + b.net512,
    produits: a.produits + b.produits,
    charges: a.charges + b.charges,
  };
}
