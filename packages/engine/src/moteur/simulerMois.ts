import type { Parametres } from "@kapital/content";
import type { MarketInputs } from "../types/marketInputs.js";
import type { Entreprise } from "../types/entreprise.js";
import type { Graine, MoisJeu } from "../types/primitifs.js";
import { cloturerMois } from "./cloture.js";
import {
  cumulVide,
  type DonneesReellesMois,
  type ResultatClotureEntreprise,
} from "./donneesMois.js";
import { avancerFlux } from "./flux.js";

export type {
  CreanceAEncaisser,
  DepenseMarketingMois,
  DonneesReellesMois,
  LivraisonFaconnier,
  LivraisonMatiere,
  ResultatClotureEntreprise,
  VentePerdueParProduit,
} from "./donneesMois.js";

/**
 * Clôture d'un mois pris d'un seul bloc : tous les événements du mois arrivent
 * ensemble, puis les échéances de fin de mois sont passées.
 *
 * C'est exactement un pas de la durée d'un mois (`avancerFlux`) suivi de la
 * fin de mois (`cloturerMois`). Pour avancer pas à pas, voir `simulerPas`.
 */
export function simulerMoisEntreprise(
  entreprise: Entreprise,
  donnees: DonneesReellesMois,
  _marketInputs: MarketInputs,
  params: Parametres,
  _graine: Graine,
  mois: MoisJeu,
): ResultatClotureEntreprise {
  const flux = avancerFlux(
    entreprise,
    cumulVide(mois, entreprise.tresorerie),
    donnees,
    { params, mois, pasDebut: 0, pasFin: 1, pasParMois: 1, suffixeId: "" },
  );
  const cloture = cloturerMois(
    flux.entreprise,
    flux.cumul,
    {
      tvaAPayerCeMois: donnees.tvaAPayerCeMois,
      moisDecouvertConsecutifs: donnees.moisDecouvertConsecutifs,
    },
    params,
    mois,
  );
  // Un mois pris d'un bloc rend toutes ses écritures : flux puis clôture
  return { ...cloture, ecritures: [...flux.ecritures, ...cloture.ecritures] };
}
