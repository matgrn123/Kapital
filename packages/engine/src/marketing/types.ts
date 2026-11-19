import type { ActionMarketing } from "../types/decision.js";
import type { Centimes } from "../types/primitifs.js";

export type EtatJauges = {
  readonly notoriete: number;
  readonly desirabilite: number;
};

export type CoefficientsMarketing = {
  readonly kNotorietePublicite: number;
  readonly kDesirabiliteImage: number;
  readonly kNotorietePromotion: number;
  readonly kDesirabilitePromotionNegatif: number;
  readonly kNotorieteRp: number;
  readonly kDesirabiliteRp: number;
  readonly decroissanceNotoriete: number;
  readonly decroissanceDesirabilite: number;
};

export type DepenseMarketing = {
  readonly action: ActionMarketing;
  readonly montant: Centimes;
};

export type EffetMarketing = {
  readonly deltaNotoriete: number;
  readonly deltaDesirabilite: number;
};
