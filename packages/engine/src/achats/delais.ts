import { moisDeLInstantMs } from "../moteur/temps.js";
import type { MoisJeu } from "../types/primitifs.js";

/**
 * Délais de livraison en heures réelles (décision de Mathieu du 26 novembre 2026) :
 * l'horloge du jeu est l'horloge réelle, une commande passée à 10 h 21 chez un fournisseur
 * à 2 h de délai arrive vers 12 h 21. Le délai de chaque partenaire est une donnée de la
 * base (`suppliers.delai_heures`, `faconniers.delai_heures`), celui du grossiste un
 * paramètre (`grossiste_delai_minutes`).
 *
 * Seule la livraison est en heures : le paiement du fournisseur reste calé sur les mois
 * (délai de paiement compté depuis le mois de livraison).
 */

const MS_PAR_MINUTE = 60_000;
const MINUTES_PAR_HEURE = 60;

export type EcheanceLivraison = {
  /** Instant de livraison, en heure du jeu (ms depuis le 1er janvier 1970 UTC). */
  readonly instantLivraisonMs: number;
  /** Mois de jeu où tombe la livraison : celui de l'écriture 31/401 ou 35/401. */
  readonly moisLivraison: MoisJeu;
};

/** Délai en minutes (entier, jamais négatif) d'un délai exprimé en heures, éventuellement fractionnaires. */
export function minutesDuDelai(delaiHeures: number): number {
  if (!Number.isFinite(delaiHeures) || delaiHeures < 0) {
    throw new Error(`Délai de livraison invalide : ${delaiHeures} h (il doit être positif ou nul).`);
  }
  return Math.round(delaiHeures * MINUTES_PAR_HEURE);
}

/**
 * Livraison d'une commande passée à `instantCommandeMs` (heure du jeu) avec un délai de
 * `delaiMinutes` minutes réelles : l'instant de livraison et son mois de jeu.
 */
export function livraisonApresMinutes(instantCommandeMs: number, delaiMinutes: number): EcheanceLivraison {
  if (!Number.isFinite(instantCommandeMs)) {
    throw new Error(`Instant de commande invalide : ${instantCommandeMs}.`);
  }
  if (!Number.isFinite(delaiMinutes) || delaiMinutes < 0) {
    throw new Error(`Délai de livraison invalide : ${delaiMinutes} min (il doit être positif ou nul).`);
  }
  const instantLivraisonMs = instantCommandeMs + Math.round(delaiMinutes * MS_PAR_MINUTE);
  return { instantLivraisonMs, moisLivraison: moisDeLInstantMs(instantLivraisonMs) };
}

/** Livraison après un délai en heures (fournisseurs de matière et façonniers). */
export function livraisonApresHeures(instantCommandeMs: number, delaiHeures: number): EcheanceLivraison {
  return livraisonApresMinutes(instantCommandeMs, minutesDuDelai(delaiHeures));
}
