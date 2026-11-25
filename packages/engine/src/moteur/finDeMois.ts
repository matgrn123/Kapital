import type { Compte } from "../comptabilite/types.js";

// Données de fin de mois que le serveur (ou le banc) lit dans le grand livre avant la clôture.
// Fonctions pures : la même règle sert au serveur, au banc d'essai et aux tests.

type LigneSimple = { readonly sens: string; readonly montant: number };
type LigneCompte = LigneSimple & { readonly compte: string };

/**
 * TVA à payer à la clôture : ce qui reste dû au compte 44551 à la fin du mois précédent
 * (déclarations moins paiements déjà faits). Une TVA restée impayée est rattrapée.
 */
export function tvaRestantDue(lignes44551JusquAuMoisPrecedent: readonly LigneSimple[]): number {
  let solde = 0;
  for (const l of lignes44551JusquAuMoisPrecedent) solde += l.sens === "credit" ? l.montant : -l.montant;
  return Math.max(0, solde);
}

/** Premier mois de l'exercice qui contient `mois` (exercices de 12 mois, comptés depuis 0). */
export function debutExercice(mois: number): number {
  return mois - (((mois % 12) + 12) % 12);
}

/** Résultat (produits − charges) de lignes du grand livre, selon le type de chaque compte. */
export function resultatDepuisLignes(
  lignes: readonly LigneCompte[],
  comptes: Readonly<Record<string, Compte>>,
): number {
  let resultat = 0;
  for (const l of lignes) {
    const type = comptes[l.compte]?.type;
    const signe = l.sens === "credit" ? 1 : -1;
    if (type === "produits" || type === "charges") resultat += signe * l.montant;
  }
  return resultat;
}
