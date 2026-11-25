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
  /** Chiffre d'affaires cumulé hors taxes pour ouvrir l'étape 3 (la boutique). */
  readonly chiffreAffairesHtEtape3: Centimes;
  /** Trésorerie minimale à la clôture pour ouvrir l'étape 3 (de quoi ouvrir une boutique sans découvert). */
  readonly tresorerieMinimaleEtape3: Centimes;
  /** Notoriété minimale (jauge de 0 à 100) pour ouvrir l'étape 3. */
  readonly notorieteMinimaleEtape3: number;
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
    chiffreAffairesHtEtape3: centimes(
      entierPositif(params, "seuil_etape_3_chiffre_affaires_ht_cumule_centimes"),
    ),
    tresorerieMinimaleEtape3: centimes(entierPositif(params, "seuil_etape_3_tresorerie_minimale_centimes")),
    notorieteMinimaleEtape3: entierPositif(params, "seuil_etape_3_notoriete_minimale"),
  };
}

/** Ce que le constat lit : l'étape actuelle, les compteurs, la trésorerie et la notoriété. */
export type EtatPourEtape = {
  readonly etape: EtapeEntreprise;
  readonly cumuls: CumulsEtape;
  readonly tresorerie: Centimes;
  /** Notoriété de la marque (0 à 100) ; absente = 0. Ne compte que pour l'étape 3. */
  readonly notoriete?: number;
};

/** La dernière étape du module Entrepreneur (V1). */
export const DERNIERE_ETAPE: EtapeEntreprise = 3;

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
  // Étape 3 : l'étape 2 acquise (aujourd'hui ou avant), plus le chiffre d'affaires de l'étape 3,
  // une trésorerie qui permet d'ouvrir une boutique et une marque déjà connue.
  if (
    Math.max(etat.etape, atteinte) >= 2 &&
    etat.cumuls.chiffreAffairesHt >= seuils.chiffreAffairesHtEtape3 &&
    etat.tresorerie >= seuils.tresorerieMinimaleEtape3 &&
    (etat.notoriete ?? 0) >= seuils.notorieteMinimaleEtape3
  ) {
    atteinte = 3;
  }
  return Math.max(etat.etape, atteinte) as EtapeEntreprise;
}

/** Une condition d'étape non remplie, chiffrée. */
export type ConditionManquante = {
  /** Clé stable, pour l'interface. */
  readonly cle:
    | "pieces_vendues"
    | "chiffre_affaires_ht_cumule"
    | "tresorerie_positive"
    | "tresorerie_minimale"
    | "notoriete";
  readonly unite: "pieces" | "centimes" | "points";
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
  // Pour l'étape 3, les seuils de chiffre d'affaires et de trésorerie remplacent ceux de l'étape 2
  // (ils sont plus hauts) : une seule ligne par condition.
  const caRequis = cible >= 3 ? seuils.chiffreAffairesHtEtape3 : seuils.chiffreAffairesHtEtape2;
  if (cible >= 2) {
    if (etat.cumuls.chiffreAffairesHt < caRequis) {
      manquantes.push({
        cle: "chiffre_affaires_ht_cumule",
        unite: "centimes",
        actuel: etat.cumuls.chiffreAffairesHt,
        requis: caRequis,
        manque: caRequis - etat.cumuls.chiffreAffairesHt,
      });
    }
  }
  if (cible >= 3) {
    if (etat.tresorerie < seuils.tresorerieMinimaleEtape3) {
      manquantes.push({
        cle: "tresorerie_minimale",
        unite: "centimes",
        actuel: etat.tresorerie,
        requis: seuils.tresorerieMinimaleEtape3,
        manque: seuils.tresorerieMinimaleEtape3 - etat.tresorerie,
      });
    }
    const notoriete = etat.notoriete ?? 0;
    if (notoriete < seuils.notorieteMinimaleEtape3) {
      manquantes.push({
        cle: "notoriete",
        unite: "points",
        actuel: notoriete,
        requis: seuils.notorieteMinimaleEtape3,
        manque: seuils.notorieteMinimaleEtape3 - notoriete,
      });
    }
  } else if (cible >= 2) {
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
 * étape 1 : publicité ; étape 2 : emprunter, louer, acheter un local, produire à l'atelier,
 * embaucher, vendre aux revendeurs ; étape 3 : ouvrir une boutique (AE-11).
 */
export const DEBLOCAGES_PAR_ACTION = {
  action_marketing: 1,
  demande_pret: 2,
  louer_atelier: 2,
  achat_local: 2,
  production_atelier: 2,
  embauche: 2,
  vente_revendeur: 2,
  ouverture_boutique: 3,
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

/**
 * Réglage de développement : quand le paramètre `deblocage_total_developpement` vaut 1,
 * toutes les actions sont débloquées, sans attendre les seuils. À remettre à 0 avant
 * l'ouverture publique : c'est le seul endroit qui contourne les étapes.
 */
export function deblocageTotalActif(params: Parametres): boolean {
  return params["deblocage_total_developpement"]?.valeur === 1;
}

/** L'étape à prendre en compte pour les verrous : la dernière (3) si le déblocage total est actif. */
export function etapeEffective(etapeReelle: EtapeEntreprise, params: Parametres): EtapeEntreprise {
  return deblocageTotalActif(params) ? DERNIERE_ETAPE : etapeReelle;
}
