import type { EcritureComptable } from "../comptabilite/types.js";
import { AGREGATS_VIDES, type AgregatsMois } from "./agregats.js";
import type { Entreprise, EtapeEntreprise, FicheFabrication } from "../types/entreprise.js";
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
  /**
   * Nomenclature du produit quand le façonnier travaille la matière du joueur :
   * à la livraison, matière × (1 + chute) sort du stock 31 (au coût moyen) et
   * les fournitures s'ajoutent à la facture du façonnier.
   * null : le façonnier fournit tout (grossiste), seule sa facture compte.
   */
  readonly matiereDuJoueur: FicheFabrication | null;
};

/**
 * Dette fournisseur ou façonnier arrivée à échéance : réglée au premier pas du mois
 * de l'échéance (401 débit / 512 crédit), même si la banque passe sous zéro
 * (le découvert est alors facturé à la clôture, cahier des charges 6.1 étape 6).
 */
export type DetteFournisseurEchue = {
  /** Identifiant de la commande (purchase_orders ou production_orders). */
  readonly ordreId: string;
  readonly nature: "matiere" | "faconnier";
  readonly montant: Centimes;
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
  /** Dettes fournisseurs et façonniers à régler dans ce flux (absent = aucune). */
  readonly dettesEchues?: readonly DetteFournisseurEchue[];
};

/** Ce dont le moteur a besoin seulement à la clôture du mois. */
export type DonneesFinMois = {
  readonly tvaAPayerCeMois: Centimes;
  readonly moisDecouvertConsecutifs: number;
  /**
   * Résultat (produits − charges) de l'exercice lu dans le grand livre, hors ce que les pas du
   * mois ont déjà compté (cumul.agregats) : les mois déjà clos, plus les écritures du mois passées
   * par une route (publicité…). Sert à l'impôt sur les sociétés, calculé au 12e mois sur
   * l'exercice entier. Absent = 0.
   */
  readonly resultatExerciceAvantMois?: Centimes;
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

/**
 * Résultat de la clôture mensuelle pour une entreprise.
 * `ecritures` ne contient que ce que la clôture a passé (paie, loyer, prêt, TVA...) :
 * les écritures des flux du mois sont celles de chaque pas.
 */
export type ResultatClotureEntreprise = {
  readonly entrepriseApres: Entreprise;
  readonly ecritures: readonly EcritureComptable[];
  readonly ventesPerdues: readonly VentePerdueParProduit[];
  readonly explications: readonly Explication[];
  readonly moisDecouvertConsecutifsApres: number;
  /** Étape constatée à la clôture (jamais inférieure à l'étape d'avant). */
  readonly etapeApres: EtapeEntreprise;
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
  /**
   * Rang du pas où l'entreprise a démarré dans ce mois (0 : depuis le début du mois).
   * Une entreprise créée en cours de mois ne produit et ne vend que la part du mois
   * écoulée depuis son démarrage, jamais le début de mois qu'elle n'a pas vécu.
   */
  readonly pasDemarrage: number;
  readonly tresorerieDebutMois: Centimes;
  /**
   * Totaux des écritures du mois (TVA, banque, produits, charges), pour la clôture.
   * On ne recopie pas les écritures : elles sont déjà en base, et l'état reste petit.
   */
  readonly agregats: AgregatsMois;
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
    pasDemarrage: 0,
    tresorerieDebutMois,
    agregats: AGREGATS_VIDES,
    produitParProduit: {},
    demandeParLigne: {},
    serviParLigne: {},
    serviDirectParProduit: {},
    retourneParProduit: {},
    chiffreAffairesHt: 0,
    piecesDirectes: 0,
  };
}

/** État de départ d'une entreprise qui rejoint le monde au pas `pas` d'un mois en cours. */
export function cumulDemarrantAuPas(
  mois: MoisJeu,
  tresorerieDebutMois: Centimes,
  pas: number,
): CumulMois {
  if (!Number.isInteger(pas) || pas < 0) {
    throw new Error(`Le pas de démarrage doit être un entier >= 0, reçu ${pas}.`);
  }
  return { ...cumulVide(mois, tresorerieDebutMois), pasTraites: pas, pasDemarrage: pas };
}
