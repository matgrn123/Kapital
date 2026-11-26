import type { Canal } from "../types/entreprise.js";
import type { Centimes, IdProduit, MoisJeu } from "../types/primitifs.js";

export type EntreesMargeVenteDirecte = {
  readonly prixTtcUnitaire: Centimes;
  readonly coutRevientUnitaire: Centimes;
  readonly tauxTva: number;
  readonly tauxRetour: number;
  readonly coutTraitementRetourUnitaire: Centimes;
};

export type EntreesMargeRevendeur = {
  readonly prixGrosHtUnitaire: Centimes;
  readonly coutRevientUnitaire: Centimes;
};

export type EntreesEcritureVenteDirecte = {
  readonly idEcriture: string;
  readonly mois: MoisJeu;
  readonly produit: IdProduit;
  readonly quantite: number;
  readonly prixTtcUnitaire: Centimes;
  readonly coutRevientUnitaire: Centimes;
  /**
   * Coût total sorti du stock pour cette vente (35 / 7135). Absent = coût unitaire × quantité.
   * Le moteur le fournit pour que le compte 35 suive exactement la valeur de son stock.
   */
  readonly coutRevientTotal?: Centimes;
  readonly tauxTva: number;
};

export type EntreesEcritureVenteRevendeur = {
  readonly idEcriture: string;
  readonly mois: MoisJeu;
  readonly produit: IdProduit;
  readonly quantite: number;
  /** Prix de gros saisi par le joueur : hors taxes. Le revendeur paie ce prix plus la TVA. */
  readonly prixGrosHtUnitaire: Centimes;
  readonly coutRevientUnitaire: Centimes;
  /**
   * Coût total sorti du stock pour cette vente (35 / 7135). Absent = coût unitaire × quantité.
   * Le moteur le fournit pour que le compte 35 suive exactement la valeur de son stock.
   */
  readonly coutRevientTotal?: Centimes;
  /** Taux de TVA collectée sur la facture (paramètre `tva_standard`). */
  readonly tauxTva: number;
};

export type EntreesEcritureRetour = {
  readonly idEcriture: string;
  readonly mois: MoisJeu;
  readonly produit: IdProduit;
  readonly quantiteRetournee: number;
  readonly prixTtcUnitaire: Centimes;
  readonly coutRevientUnitaire: Centimes;
  readonly coutTraitementRetourUnitaire: Centimes;
  readonly tauxTva: number;
};

export type Canaux = Canal;
