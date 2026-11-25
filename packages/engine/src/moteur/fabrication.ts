import type { Parametres } from "@kapital/content";
import { centimes, type Centimes } from "../types/primitifs.js";
import type { FicheFabrication } from "../types/entreprise.js";

// ---------------------------------------------------------------------------
// Fabrication : ce qu'une pièce consomme, et ce que l'on doit aux fournisseurs.
// Fonctions pures, partagées par le moteur et par le serveur (calcul des dettes).
// ---------------------------------------------------------------------------

/** Lit un paramètre obligatoire : pas de valeur de repli cachée dans le code. */
export function parametreObligatoire(params: Parametres, cle: string): number {
  const p = params[cle];
  if (p === undefined || !Number.isFinite(p.valeur)) {
    throw new Error(`Paramètre manquant dans parametres-v1.json : ${cle}`);
  }
  return p.valeur;
}

/** Arrondi des quantités de matière (au millionième d'unité) pour éviter les poussières de calcul. */
function arrondirQuantite(q: number): number {
  return Math.round(q * 1_000_000) / 1_000_000;
}

/** Matière à sortir du stock pour `pieces` pièces : pièces × consommation × (1 + taux de chute). */
export function besoinMatiere(pieces: number, fiche: FicheFabrication, tauxChute: number): number {
  return arrondirQuantite(pieces * fiche.consommationParPiece * (1 + tauxChute));
}

/** Nombre de pièces que permet la matière disponible (arrondi à l'entier inférieur). */
export function piecesPermisesParLaMatiere(
  quantiteMatiere: number,
  fiche: FicheFabrication,
  tauxChute: number,
): number {
  const parPiece = besoinMatiere(1, fiche, tauxChute);
  if (parPiece <= 0) return Number.POSITIVE_INFINITY;
  // Petite marge pour qu'un stock égal au besoin exact ne perde pas une pièce à l'arrondi.
  return Math.floor(quantiteMatiere / parPiece + 1e-9);
}

/** Montant d'une livraison de matière (dette fournisseur, compte 401). */
export function montantLivraisonMatiere(quantite: number, prixUnitaire: Centimes): Centimes {
  return centimes(Math.round(quantite * prixUnitaire));
}

/**
 * Facture d'un façonnier (compte 401) : façon + fournitures, par pièce.
 * La matière, elle, vient du stock du joueur et n'est pas facturée.
 * `fiche` vaut null quand le façonnier fournit tout (grossiste) : seule la façon est due.
 */
export function montantFactureFaconnier(
  quantite: number,
  prixFaconParPiece: Centimes,
  fiche: FicheFabrication | null,
): Centimes {
  const fournitures = fiche === null ? 0 : fiche.fournituresParPiece;
  return centimes(quantite * (prixFaconParPiece + fournitures));
}
