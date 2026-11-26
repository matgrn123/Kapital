import type { ActionMarketing } from "../types/decision.js";
import type { EtapeEntreprise } from "../types/entreprise.js";
import type { Centimes } from "../types/primitifs.js";

export type EtatJauges = {
  readonly notoriete: number;
  readonly desirabilite: number;
};

/**
 * Règles d'une action marketing, lues dans les paramètres :
 * effet = k × ln(1 + montant utile en euros) × aléa, sur chaque jauge.
 */
export type ReglesActionMarketing = {
  /** Coefficient sur la notoriété. */
  readonly kNotoriete: number;
  /** Coefficient sur la désirabilité (négatif : l'action abîme l'image, comme la promotion). */
  readonly kDesirabilite: number;
  /** Plus petit montant accepté (centimes). */
  readonly montantMinimum: Centimes;
  /** Aléa = 1 + amplitude × (2u − 1), u entre 0 et 1. 0 : pas d'aléa. Toujours < 1. */
  readonly amplitudeAlea: number;
  /** Part du budget prélevée en honoraires (agence), sans effet sur la marque. 0 sinon. */
  readonly tauxHonoraires: number;
  /** Étape à partir de laquelle l'action est proposée, en plus du verrou de la publicité. */
  readonly etapeMinimum?: EtapeEntreprise;
  /** Réseaux sociaux : coût pour 1 000 affichages (centimes), pour l'affichage seulement. */
  readonly coutPourMilleAffichages?: Centimes;
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
  /** Table des règles de chaque action (les quatre premières reprennent les k ci-dessus). */
  readonly actions: Readonly<Record<ActionMarketing, ReglesActionMarketing>>;
};

export type DepenseMarketing = {
  readonly action: ActionMarketing;
  readonly montant: Centimes;
  /** Aléa tiré pour cette action (aleaMarketing). Absent : 1. Ignoré si l'action n'a pas d'aléa. */
  readonly alea?: number;
};

export type EffetMarketing = {
  readonly deltaNotoriete: number;
  readonly deltaDesirabilite: number;
};
