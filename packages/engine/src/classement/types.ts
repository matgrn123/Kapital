import type { Centimes } from "../types/primitifs.js";

export type EcritureClassement = {
  readonly compte: string;
  readonly sens: "debit" | "credit";
  readonly montant_centimes: number;
};

export type ValeurEntreprise = {
  readonly actif_centimes: Centimes;
  readonly passif_externe_centimes: Centimes;
  readonly valeur_centimes: Centimes;
};

export type LigneClassement = {
  readonly rang: number;
  readonly company_id: string;
  readonly nom: string;
  readonly pseudo: string;
  readonly gamme: string;
  readonly valeur_centimes: Centimes;
};
