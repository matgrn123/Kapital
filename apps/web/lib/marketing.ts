import { formaterEuros } from "./formatage";
import type { Parametres } from "@kapital/content";
import {
  ACTIONS_MARKETING,
  centimes,
  coefficientsMarketingDepuisParametres,
  fluxMarque,
  type ActionMarketing,
  type EtatJauges,
} from "@kapital/engine";

/** Les dix actions du moteur (publicité classique, réseaux sociaux, influenceurs, métro, agence). */
export { ACTIONS_MARKETING };

export function estActionMarketing(x: unknown): x is ActionMarketing {
  return typeof x === "string" && (ACTIONS_MARKETING as readonly string[]).includes(x);
}

/** Compte de charge d'une action marketing : 623 « Publicité, publications, relations publiques ». */
export const COMPTE_MARKETING = "623";

/**
 * Effet immédiat d'une action marketing sur la marque, calculé par le moteur (fluxMarque,
 * sans décroissance : durée 0) avec les coefficients marketing_k_* des paramètres.
 * `alea` : l'aléa tiré par la route pour un influenceur (aleaMarketing) ; 1 par défaut.
 */
export function marqueApresAction(
  marque: EtatJauges,
  action: ActionMarketing,
  montantCentimes: number,
  params: Parametres,
  alea = 1,
): EtatJauges {
  return fluxMarque(
    marque,
    0,
    [{ action, montant: centimes(montantCentimes), alea }],
    coefficientsMarketingDepuisParametres(params),
  );
}

/** Part de la trésorerie au-delà de laquelle l'écran demande une confirmation (ergonomie, pas une règle du jeu). */
export const SEUIL_CONFIRMATION_DEPENSE = 0.5;

/**
 * Texte de confirmation quand une dépense immédiate entame plus de la moitié de la trésorerie,
 * sinon null. Évite de vider la caisse d'un geste de curseur.
 */
export function confirmationDepense(montantCentimes: number, tresorerieCentimes: number): string | null {
  if (tresorerieCentimes <= 0 || montantCentimes <= tresorerieCentimes * SEUIL_CONFIRMATION_DEPENSE) return null;
  const part = Math.round((montantCentimes / tresorerieCentimes) * 100);
  return (
    `Tu vas dépenser ${formaterEuros(montantCentimes)} €, soit ${part} % de ta trésorerie. ` +
    `Il ne te restera que ${formaterEuros(tresorerieCentimes - montantCentimes)} € pour payer salaires et loyers en fin de mois.`
  );
}
