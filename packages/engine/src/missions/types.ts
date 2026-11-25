import type { Centimes } from "../types/primitifs.js";

export type IdMission = "mission1" | "mission2" | "mission3" | "mission4" | "mission5";

export type EtatMission = "a_faire" | "en_cours" | "validee";

export type DefinitionMission = {
  readonly id: IdMission;
  readonly numero: 1 | 2 | 3 | 4 | 5;
  readonly titre: string;
  readonly objectif: string;
  readonly notion: string;
  readonly explication: string;
};

/** Une boutique signée : le bail court dès la signature, la boutique ouvre après les travaux. */
export type BoutiquePourMission = {
  readonly mois_signature: number;
  readonly mois_ouverture: number;
};

/** Solde du compte 512 (banque) à la fin d'un mois où il a bougé. */
export type SoldeTresorerieMois = {
  readonly mois: number;
  readonly solde_centimes: Centimes;
};

export type MetriquesMissions = {
  readonly pieces_vendues_total: number;
  readonly marge_brute_cumul_centimes: Centimes;
  readonly mois_jeu_courant: number;
  readonly mois_jeu_creation: number;
  readonly a_eu_decouvert: boolean;
  readonly ca_mois_initial_centimes: Centimes;
  readonly ca_mois_max_centimes: Centimes;
  /** AE-11 : boutiques signées (vide si aucune). */
  readonly boutiques: readonly BoutiquePourMission[];
  /** AE-11 : solde de trésorerie en fin de mois, mois croissants (seuls les mois où il a bougé). */
  readonly tresorerie_fin_mois: readonly SoldeTresorerieMois[];
  /** AE-11 : un local a été loué (bail signé) ou acheté. */
  readonly local_signe: boolean;
};

export type ProgressionMission = {
  readonly id: IdMission;
  readonly etat: EtatMission;
  readonly actuel: number;
  readonly cible: number;
};
