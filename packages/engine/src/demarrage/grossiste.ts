import type { Parametres } from "@kapital/content";
import { centimes, type Centimes, type IdProduit } from "../types/primitifs.js";
import { ErreurDemarrage } from "./erreurs.js";

const MS_PAR_MINUTE = 60_000;

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
 * Le grossiste livre « le jour même » : un jour de jeu, soit 1/30 de mois de jeu.
 * Déduit des paramètres du temps (1440 minutes par mois de jeu, 30 jours par mois).
 */
export function delaiGrossisteMinutes(params: Parametres): number {
  const parMois = lire(params, "temps_minutes_reelles_par_mois_jeu");
  const jours = lire(params, "temps_jours_par_mois_jeu");
  if (parMois <= 0 || jours <= 0) {
    throw new ErreurDemarrage("Les paramètres du temps doivent être positifs.");
  }
  return parMois / jours;
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
  readonly instantLivraisonMs: number;
};

export function commanderAuGrossiste(e: EntreesCommandeGrossiste): CommandeGrossiste {
  if (!Number.isInteger(e.quantite) || e.quantite <= 0) {
    throw new ErreurDemarrage(
      `Commande au grossiste : la quantité doit être un entier strictement positif, reçu ${e.quantite}.`,
    );
  }
  const prixParPiece = prixGrossiste(e.coutUsineParPiece, e.params);
  return {
    produit: e.produit,
    quantite: e.quantite,
    prixParPiece,
    total: centimes(e.quantite * prixParPiece),
    instantLivraisonMs: e.instantCommandeMs + delaiGrossisteMinutes(e.params) * MS_PAR_MINUTE,
  };
}
