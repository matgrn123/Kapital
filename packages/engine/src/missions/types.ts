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

/**
 * Durées des missions, en jours réels (horloge réelle, décision de Mathieu du 26/11/2026).
 * Lues dans packages/content/parametres-v1.json par `reglesMissionsDepuis`.
 */
export type ReglesMissions = {
  /** Mission 2 « Tenir 7 jours » : jours sans découvert depuis la création (`mission_tenir_jours`). */
  readonly joursTenir: number;
  /** Mission 3 : longueur des périodes de CA comparées, en jours (`mission_croissance_periode_jours`). */
  readonly joursPeriodeCroissance: number;
  /** Mission 4 : jours sans découvert après la signature du bail (`mission_boutique_jours`). */
  readonly joursBoutique: number;
};

/** Une boutique signée : instant de la signature du bail (heure du jeu, ms). */
export type BoutiquePourMission = {
  readonly signee_le_ms: number;
};

/** Solde du compte 512 (banque) juste après les écritures d'un instant (heure du jeu, ms). */
export type SoldeTresorerie = {
  readonly instant_ms: number;
  readonly solde_centimes: Centimes;
};

export type MetriquesMissions = {
  readonly pieces_vendues_total: number;
  readonly marge_brute_cumul_centimes: Centimes;
  /** Création de la société (heure du jeu, ms). */
  readonly creation_ms: number;
  /** Instant de l'évaluation (heure du jeu, ms). */
  readonly maintenant_ms: number;
  /** Le solde du 512 est passé sous zéro au moins une fois depuis la création. */
  readonly a_eu_decouvert: boolean;
  /** CA HT de la première période (semaine) où la société a vendu. */
  readonly ca_periode_initiale_centimes: Centimes;
  /** Meilleur CA HT d'une période (semaine). */
  readonly ca_periode_max_centimes: Centimes;
  /** AE-11 : boutiques signées (vide si aucune). */
  readonly boutiques: readonly BoutiquePourMission[];
  /** Solde de trésorerie au fil des écritures, par instant croissant (seuls les instants où il bouge). */
  readonly tresorerie: readonly SoldeTresorerie[];
  /** AE-11 : un local a été loué (bail signé) ou acheté. */
  readonly local_signe: boolean;
  readonly regles: ReglesMissions;
};

export type ProgressionMission = {
  readonly id: IdMission;
  readonly etat: EtatMission;
  readonly actuel: number;
  readonly cible: number;
};
