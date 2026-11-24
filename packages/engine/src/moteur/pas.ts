import type { Parametres } from "@kapital/content";
import type { EcritureComptable } from "../comptabilite/types.js";
import type { Entreprise } from "../types/entreprise.js";
import type { MarketInputs } from "../types/marketInputs.js";
import type { Graine, MoisJeu } from "../types/primitifs.js";
import { cloturerMois } from "./cloture.js";
import {
  cumulVide,
  type CumulMois,
  type DonneesFinMois,
  type DonneesFlux,
  type ResultatClotureEntreprise,
} from "./donneesMois.js";
import { avancerFlux } from "./flux.js";
import { configTempsDepuis } from "./temps.js";

export type ResultatSimulerPas = {
  readonly entrepriseApres: Entreprise;
  /**
   * État du mois à rendre au pas suivant (il passe tel quel en JSON).
   * `null` quand le mois est clos : le pas suivant ouvre un nouveau mois.
   */
  readonly cumul: CumulMois | null;
  /** Écritures passées pendant ce pas seulement (celles du mois entier : `cloture.ecritures`). */
  readonly ecrituresDuPas: readonly EcritureComptable[];
  /** Renseigné au dernier pas du mois : bilan, explications, ventes perdues. */
  readonly cloture: ResultatClotureEntreprise | null;
};

/**
 * Fait avancer une entreprise d'un pas (10 minutes réelles par défaut) :
 * production, marque, ventes, retours et événements datés de ce pas.
 * Au dernier pas du mois, passe aussi les échéances de fin de mois
 * (salaires, loyer, prêt, TVA, agios, impôt) et rend `cloture`.
 *
 * Fonction pure : aucun accès base ni horloge. Pour le premier pas du mois,
 * passer `cumul = null` ; pour les suivants, le `cumul` rendu par le pas précédent.
 *
 * `donneesFin` n'est lu qu'au dernier pas du mois (obligatoire alors).
 */
export function simulerPas(
  entreprise: Entreprise,
  cumul: CumulMois | null,
  donnees: DonneesFlux,
  donneesFin: DonneesFinMois | null,
  _marketInputs: MarketInputs,
  params: Parametres,
  _graine: Graine,
  mois: MoisJeu,
  indexDansMois: number,
): ResultatSimulerPas {
  const config = configTempsDepuis(params);
  if (!Number.isInteger(indexDansMois) || indexDansMois < 0 || indexDansMois >= config.pasParMois) {
    throw new Error(
      `Index de pas hors du mois : ${indexDansMois} (un mois compte ${config.pasParMois} pas, de 0 à ${config.pasParMois - 1}).`,
    );
  }

  let cumulAvant: CumulMois;
  if (cumul === null) {
    if (indexDansMois !== 0) {
      throw new Error(
        `L'état cumulé du mois (cumul) est requis pour le pas ${indexDansMois} : seul le pas 0 peut démarrer sans.`,
      );
    }
    cumulAvant = cumulVide(mois, entreprise.tresorerie);
  } else {
    if (cumul.mois !== mois) {
      throw new Error(`Le cumul appartient au mois ${cumul.mois}, pas au mois ${mois}.`);
    }
    if (cumul.pasTraites !== indexDansMois) {
      throw new Error(
        `Pas ${indexDansMois} refusé : ${cumul.pasTraites} pas déjà traités ce mois (pas déjà rejoué ou pas manquant).`,
      );
    }
    cumulAvant = cumul;
  }

  const estDernierPas = indexDansMois === config.pasParMois - 1;
  if (estDernierPas && donneesFin === null) {
    throw new Error(
      `Le dernier pas du mois ${mois} clôture le mois : les données de fin de mois (donneesFin) sont obligatoires.`,
    );
  }

  const flux = avancerFlux(entreprise, cumulAvant, donnees, {
    params,
    mois,
    pasDebut: indexDansMois,
    pasFin: indexDansMois + 1,
    pasParMois: config.pasParMois,
    suffixeId: `_p${indexDansMois}`,
  });
  const cumulApres: CumulMois = { ...flux.cumul, pasTraites: indexDansMois + 1 };

  if (!estDernierPas) {
    return {
      entrepriseApres: flux.entreprise,
      cumul: cumulApres,
      ecrituresDuPas: flux.ecritures,
      cloture: null,
    };
  }

  const cloture = cloturerMois(flux.entreprise, cumulApres, donneesFin!, params, mois);
  return {
    entrepriseApres: cloture.entrepriseApres,
    cumul: null,
    ecrituresDuPas: cloture.ecritures.slice(cumulAvant.ecritures.length),
    cloture,
  };
}
