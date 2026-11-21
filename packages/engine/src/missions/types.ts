import type { Centimes } from "../types/primitifs.js";

export type IdMission = "mission1" | "mission2" | "mission3";

export type EtatMission = "a_faire" | "en_cours" | "validee";

export type DefinitionMission = {
  readonly id: IdMission;
  readonly numero: 1 | 2 | 3;
  readonly titre: string;
  readonly objectif: string;
  readonly notion: string;
  readonly explication: string;
};

export type MetriquesMissions = {
  readonly pieces_vendues_total: number;
  readonly marge_brute_cumul_centimes: Centimes;
  readonly mois_jeu_courant: number;
  readonly mois_jeu_creation: number;
  readonly a_eu_decouvert: boolean;
  readonly ca_mois_initial_centimes: Centimes;
  readonly ca_mois_max_centimes: Centimes;
};

export type ProgressionMission = {
  readonly id: IdMission;
  readonly etat: EtatMission;
  readonly actuel: number;
  readonly cible: number;
};
