import type { Parametres } from "@kapital/content";
import { livraisonApresMinutes } from "../achats/delais.js";
import { centimes, type Centimes, type IdProduit, type MoisJeu } from "../types/primitifs.js";
import { ErreurDemarrage } from "./erreurs.js";

function lire(params: Parametres, cle: string): number {
  const p = params[cle];
  if (!p) throw new ErreurDemarrage(`Paramètre manquant : ${cle}.`);
  return p.valeur;
}

/** Prix d'une pièce chez le grossiste : coût de revient à l'usine, majoré. */
export function prixGrossiste(coutUsineParPiece: Centimes, params: Parametres): Centimes {
  const majoration = lire(params, "grossiste_majoration_sur_cout_usine");
  if (!Number.isFinite(majoration) || majoration <= 0) {
    throw new ErreurDemarrage(
      `grossiste_majoration_sur_cout_usine doit être positive (le grossiste coûte plus cher que l'usine), reçu ${majoration}.`,
    );
  }
  return centimes(Math.round(coutUsineParPiece * (1 + majoration)));
}

/**
 * Le grossiste local livre en 30 minutes réelles (paramètre `grossiste_delai_minutes`,
 * décision de Mathieu du 26 novembre 2026) : l'horloge du jeu est l'horloge réelle.
 */
export function delaiGrossisteMinutes(params: Parametres): number {
  const minutes = lire(params, "grossiste_delai_minutes");
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new ErreurDemarrage(`grossiste_delai_minutes doit être positif ou nul, reçu ${minutes}.`);
  }
  return minutes;
}

export type EntreesCommandeGrossiste = {
  readonly params: Parametres;
  readonly produit: IdProduit;
  readonly quantite: number;
  readonly coutUsineParPiece: Centimes;
  readonly instantCommandeMs: number;
};

export type CommandeGrossiste = {
  readonly produit: IdProduit;
  readonly quantite: number;
  readonly prixParPiece: Centimes;
  readonly total: Centimes;
  /** Instant de livraison, en heure du jeu (ms). */
  readonly instantLivraisonMs: number;
  /** Mois de jeu de la livraison (celui de son instant). */
  readonly moisLivraison: MoisJeu;
};

export function commanderAuGrossiste(e: EntreesCommandeGrossiste): CommandeGrossiste {
  if (!Number.isInteger(e.quantite) || e.quantite <= 0) {
    throw new ErreurDemarrage(
      `Commande au grossiste : la quantité doit être un entier strictement positif, reçu ${e.quantite}.`,
    );
  }
  const prixParPiece = prixGrossiste(e.coutUsineParPiece, e.params);
  const livraison = livraisonApresMinutes(e.instantCommandeMs, delaiGrossisteMinutes(e.params));
  return {
    produit: e.produit,
    quantite: e.quantite,
    prixParPiece,
    total: centimes(e.quantite * prixParPiece),
    instantLivraisonMs: livraison.instantLivraisonMs,
    moisLivraison: livraison.moisLivraison,
  };
}
