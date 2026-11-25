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
