import type { EcritureComptable } from "../comptabilite/types.js";
import type { Entreprise } from "../types/entreprise.js";
import type { Centimes, IdMatiere, IdProduit, MoisJeu } from "../types/primitifs.js";
import type { Explication } from "../types/resultatMois.js";

// ---------------------------------------------------------------------------
// Données qui entrent dans le moteur
// ---------------------------------------------------------------------------

/** Livraison de matière qui arrive */
export type LivraisonMatiere = {
  readonly id: string;
  readonly matiere: IdMatiere;
  readonly quantite: number;
  readonly prixUnitaire: Centimes;
  readonly modePaiement: "immediat" | "credit";
};

/** Livraison façonnier qui arrive */
export type LivraisonFaconnier = {
  readonly id: string;
  readonly produit: IdProduit;
  readonly quantite: number;
  readonly prixFaconParPiece: Centimes;
  readonly coutMatiereParPiece: Centimes;
};

/** Dépense marketing */
export type DepenseMarketingMois = {
  readonly id: string;
  readonly action: string;
  readonly montant: Centimes;
};

/** Créance à encaisser (vente revendeur d'il y a 2 mois) */
export type CreanceAEncaisser = {
  readonly ecritureId: string;
  readonly montant: Centimes;
};

/**
 * Événements datés qui tombent dans un pas : ce qui arrive à ce moment-là.
 * (Un mois en bloc reçoit tous ceux du mois d'un coup.)
 */
export type DonneesFlux = {
  readonly livraisonsMatiere: readonly LivraisonMatiere[];
  readonly livraisonsFaconniers: readonly LivraisonFaconnier[];
  readonly depensesMarketing: readonly DepenseMarketingMois[];
  readonly creancesAEncaisser: readonly CreanceAEncaisser[];
};

/** Ce dont le moteur a besoin seulement à la clôture du mois. */
export type DonneesFinMois = {
  readonly tvaAPayerCeMois: Centimes;
  readonly moisDecouvertConsecutifs: number;
};

/** Toutes les données réelles pour la clôture d'un mois pris d'un seul bloc */
export type DonneesReellesMois = DonneesFlux & DonneesFinMois;

// ---------------------------------------------------------------------------
// Données qui sortent du moteur
// ---------------------------------------------------------------------------

/** Produit pour lequel la demande a dépassé le stock */
export type VentePerdueParProduit = {
  readonly produit: IdProduit;
  readonly quantiteDemandee: number;
  readonly quantiteServie: number;
};

/** Résultat de la clôture mensuelle pour une entreprise */
export type ResultatClotureEntreprise = {
  readonly entrepriseApres: Entreprise;
  readonly ecritures: readonly EcritureComptable[];
  readonly ventesPerdues: readonly VentePerdueParProduit[];
  readonly explications: readonly Explication[];
  readonly moisDecouvertConsecutifsApres: number;
};

// ---------------------------------------------------------------------------
// Ce qui se transmet d'un pas à l'autre pendant un mois
// ---------------------------------------------------------------------------

/**
 * Compteurs du mois en cours. Ne contient que des nombres, des textes et des
 * listes : il passe tel quel en JSON (c'est ce que le serveur stockera entre
 * deux pas).
 *
 * Pourquoi des cumuls : on ne produit ni ne vend 0,7 pièce. À chaque pas, on
 * calcule ce qu'il faudrait avoir produit ou vendu depuis le début du mois
 * (arrondi à l'entier inférieur), puis on traite seulement la différence avec
 * ce qui est déjà fait. Ainsi, après le dernier pas, le total est exactement
 * celui d'un mois pris d'un bloc.
 */
export type CumulMois = {
  readonly mois: MoisJeu;
  /** Nombre de pas déjà traités ce mois : empêche de rejouer ou de sauter un pas. */
  readonly pasTraites: number;
  readonly tresorerieDebutMois: Centimes;
  /** Toutes les écritures du mois, pas après pas (sert à la TVA, au découvert, à l'impôt). */
  readonly ecritures: readonly EcritureComptable[];
  /** Pièces produites par l'atelier ce mois, par produit. */
  readonly produitParProduit: Readonly<Record<string, number>>;
  /** Demande déjà traitée (servie ou perdue), par « produit|canal ». */
  readonly demandeParLigne: Readonly<Record<string, number>>;
  /** Pièces effectivement servies, par « produit|canal ». */
  readonly serviParLigne: Readonly<Record<string, number>>;
  /** Pièces vendues en direct, par produit (base du calcul des retours). */
  readonly serviDirectParProduit: Readonly<Record<string, number>>;
  /** Pièces déjà retournées, par produit. */
  readonly retourneParProduit: Readonly<Record<string, number>>;
  /** Chiffre d'affaires hors taxes du mois, en centimes. */
  readonly chiffreAffairesHt: number;
  /** Pièces vendues en direct ce mois. */
  readonly piecesDirectes: number;
};

export function cumulVide(mois: MoisJeu, tresorerieDebutMois: Centimes): CumulMois {
  return {
    mois,
    pasTraites: 0,
    tresorerieDebutMois,
    ecritures: [],
    produitParProduit: {},
    demandeParLigne: {},
    serviParLigne: {},
    serviDirectParProduit: {},
    retourneParProduit: {},
    chiffreAffairesHt: 0,
    piecesDirectes: 0,
  };
}
