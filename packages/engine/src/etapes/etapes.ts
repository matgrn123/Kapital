import type { Parametres } from "@kapital/content";
import type { CumulsEtape, EtapeEntreprise } from "../types/entreprise.js";
import { centimes, type Centimes } from "../types/primitifs.js";

export class ErreurEtapes extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurEtapes";
  }
}

/** Seuils de passage d'étape, lus dans les paramètres sourcés (jamais en dur). */
export type SeuilsEtapes = {
  /** Pièces vendues au total pour ouvrir l'étape 1. */
  readonly piecesEtape1: number;
  /** Chiffre d'affaires cumulé hors taxes pour ouvrir l'étape 2 (avec trésorerie positive). */
  readonly chiffreAffairesHtEtape2: Centimes;
};

function entierPositif(params: Parametres, cle: string): number {
  const p = params[cle];
  if (!p) throw new ErreurEtapes(`Paramètre manquant : ${cle}.`);
  if (!Number.isInteger(p.valeur) || p.valeur <= 0) {
    throw new ErreurEtapes(`${cle} doit être un entier positif, reçu ${p.valeur}.`);
  }
  return p.valeur;
}

export function seuilsEtapesDepuis(params: Parametres): SeuilsEtapes {
  return {
    piecesEtape1: entierPositif(params, "seuil_etape_1_pieces_vendues"),
    chiffreAffairesHtEtape2: centimes(
      entierPositif(params, "seuil_etape_2_chiffre_affaires_ht_cumule_centimes"),
    ),
  };
}

/** Ce que le constat lit : l'étape actuelle, les compteurs et la trésorerie. */
export type EtatPourEtape = {
  readonly etape: EtapeEntreprise;
  readonly cumuls: CumulsEtape;
  readonly tresorerie: Centimes;
};

/**
 * Constat à la clôture : la plus haute étape dont les conditions sont remplies.
 * Ne redescend jamais, quelle que soit la trésorerie.
 */
export function constaterEtape(etat: EtatPourEtape, seuils: SeuilsEtapes): EtapeEntreprise {
  let atteinte: EtapeEntreprise = 0;
  if (etat.cumuls.piecesVendues >= seuils.piecesEtape1) atteinte = 1;
  if (
    atteinte === 1 &&
    etat.cumuls.chiffreAffairesHt >= seuils.chiffreAffairesHtEtape2 &&
    etat.tresorerie > 0
  ) {
    atteinte = 2;
  }
  return Math.max(etat.etape, atteinte) as EtapeEntreprise;
}

/** Une condition d'étape non remplie, chiffrée. */
export type ConditionManquante = {
  /** Clé stable, pour l'interface. */
  readonly cle: "pieces_vendues" | "chiffre_affaires_ht_cumule" | "tresorerie_positive";
  readonly unite: "pieces" | "centimes";
  readonly actuel: number;
  readonly requis: number;
  readonly manque: number;
};

/** Conditions encore à remplir pour atteindre `cible` (liste vide si elles sont remplies). */
export function conditionsManquantes(
  cible: EtapeEntreprise,
  etat: EtatPourEtape,
  seuils: SeuilsEtapes,
): readonly ConditionManquante[] {
  const manquantes: ConditionManquante[] = [];
  if (cible >= 1 && etat.cumuls.piecesVendues < seuils.piecesEtape1) {
    manquantes.push({
      cle: "pieces_vendues",
      unite: "pieces",
      actuel: etat.cumuls.piecesVendues,
      requis: seuils.piecesEtape1,
      manque: seuils.piecesEtape1 - etat.cumuls.piecesVendues,
    });
  }
  if (cible >= 2) {
    if (etat.cumuls.chiffreAffairesHt < seuils.chiffreAffairesHtEtape2) {
      manquantes.push({
        cle: "chiffre_affaires_ht_cumule",
        unite: "centimes",
        actuel: etat.cumuls.chiffreAffairesHt,
        requis: seuils.chiffreAffairesHtEtape2,
        manque: seuils.chiffreAffairesHtEtape2 - etat.cumuls.chiffreAffairesHt,
      });
    }
    if (etat.tresorerie <= 0) {
      manquantes.push({
        cle: "tresorerie_positive",
        unite: "centimes",
        actuel: etat.tresorerie,
        requis: 1,
        manque: 1 - etat.tresorerie,
      });
    }
  }
  return manquantes;
}

/**
 * Actions soumises à une étape (docs/plan-architecture-entreprise.md §1) :
 * étape 0 : fixer les prix en ligne, acheter, produire chez un façonnier ;
 * étape 1 : publicité ; étape 2 : emprunter, louer, produire à l'atelier,
 * embaucher, vendre aux revendeurs.
 */
export const DEBLOCAGES_PAR_ACTION = {
  action_marketing: 1,
  demande_pret: 2,
  louer_atelier: 2,
  production_atelier: 2,
  embauche: 2,
  vente_revendeur: 2,
} as const satisfies Record<string, EtapeEntreprise>;

export type ActionVerrouillable = keyof typeof DEBLOCAGES_PAR_ACTION;

export const ACTIONS_VERROUILLABLES = Object.keys(DEBLOCAGES_PAR_ACTION) as readonly ActionVerrouillable[];

export function etapeRequisePour(action: ActionVerrouillable): EtapeEntreprise {
  return DEBLOCAGES_PAR_ACTION[action];
}

export type VerrouEtape = {
  readonly action: ActionVerrouillable;
  readonly etapeRequise: EtapeEntreprise;
  readonly etapeActuelle: EtapeEntreprise;
  readonly conditions: readonly ConditionManquante[];
};

/** Null si l'action est permise ; sinon le verrou, avec la condition manquante chiffrée. */
export function verrouPour(
  action: ActionVerrouillable,
  etat: EtatPourEtape,
  seuils: SeuilsEtapes,
): VerrouEtape | null {
  const etapeRequise = etapeRequisePour(action);
  if (etat.etape >= etapeRequise) return null;
  return {
    action,
    etapeRequise,
    etapeActuelle: etat.etape,
    conditions: conditionsManquantes(etapeRequise, etat, seuils),
  };
}
