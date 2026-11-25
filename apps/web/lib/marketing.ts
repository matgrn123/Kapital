import { formaterEuros } from "./formatage";
import type { Parametres } from "@kapital/content";
import {
  centimes,
  coefficientsMarketingDepuisParametres,
  fluxMarque,
  type ActionMarketing,
  type EtatJauges,
} from "@kapital/engine";

export const ACTIONS_MARKETING: readonly ActionMarketing[] = [
  "publicite",
  "image_marque",
  "promotion",
  "relations_presse",
];

export function estActionMarketing(x: unknown): x is ActionMarketing {
  return typeof x === "string" && (ACTIONS_MARKETING as readonly string[]).includes(x);
}

/** Compte de charge d'une action marketing : 623 « Publicité, publications, relations publiques ». */
export const COMPTE_MARKETING = "623";

/**
 * Effet immédiat d'une action marketing sur la marque, calculé par le moteur (fluxMarque,
 * sans décroissance : durée 0) avec les coefficients marketing_k_* des paramètres.
 */
export function marqueApresAction(
  marque: EtatJauges,
  action: ActionMarketing,
  montantCentimes: number,
  params: Parametres,
): EtatJauges {
  return fluxMarque(
    marque,
    0,
    [{ action, montant: centimes(montantCentimes) }],
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
