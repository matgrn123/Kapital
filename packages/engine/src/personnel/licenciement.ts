import type { Parametres } from "@kapital/content";
import type { EcritureComptable } from "../comptabilite/types.js";
import type { Salarie } from "../types/entreprise.js";
import { centimes, type Centimes, type IdSalarie, type MoisJeu } from "../types/primitifs.js";

// AE-7 : coût de départ d'un salarié. Fonctions pures ; l'indemnité suit l'indemnité légale
// de licenciement (service-public.fr), les taux et seuils viennent des paramètres sourcés.

export class ErreurPersonnel extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurPersonnel";
  }
}

export type ParametresLicenciement = {
  readonly ancienneteMinimaleMois: number;
  /** Mois de salaire par année d'ancienneté, jusqu'au seuil. */
  readonly moisDeSalaireParAn: number;
  /** Mois de salaire par année d'ancienneté, au-delà du seuil. */
  readonly moisDeSalaireParAnApresSeuil: number;
  readonly seuilAnnees: number;
};

function lire(params: Parametres, cle: string): number {
  const p = params[cle];
  if (!p) throw new ErreurPersonnel(`Paramètre manquant : ${cle}`);
  return p.valeur;
}

export function parametresLicenciementDepuis(params: Parametres): ParametresLicenciement {
  return {
    ancienneteMinimaleMois: lire(params, "licenciement_anciennete_minimale_mois"),
    moisDeSalaireParAn: lire(params, "licenciement_indemnite_mois_de_salaire_par_an"),
    moisDeSalaireParAnApresSeuil: lire(params, "licenciement_indemnite_mois_de_salaire_par_an_apres_seuil"),
    seuilAnnees: lire(params, "licenciement_indemnite_seuil_annees"),
  };
}

/**
 * Indemnité légale : nulle sous l'ancienneté minimale, sinon un quart de mois de salaire par
 * année (un tiers au-delà du seuil), au prorata des mois. Simplification : le salaire de
 * référence est le salaire brut mensuel actuel.
 */
export function indemniteLicenciement(salarie: Salarie, p: ParametresLicenciement): Centimes {
  if (salarie.ancienneteMois < p.ancienneteMinimaleMois) return centimes(0);
  const annees = salarie.ancienneteMois / 12;
  const avantSeuil = Math.min(annees, p.seuilAnnees);
  const apresSeuil = Math.max(0, annees - p.seuilAnnees);
  const moisDeSalaire = avantSeuil * p.moisDeSalaireParAn + apresSeuil * p.moisDeSalaireParAnApresSeuil;
  return centimes(Math.round(salarie.salaireBrutMensuel * moisDeSalaire));
}

/** Coût de départ : 641 (rémunérations) au débit, payé par la banque (512). Rien si l'indemnité est nulle. */
export function ecritureLicenciement(
  idEntreprise: string,
  mois: MoisJeu,
  salarie: IdSalarie,
  indemnite: Centimes,
): EcritureComptable | null {
  if (indemnite <= 0) return null;
  return {
    id: `licenciement_${mois}_${salarie}`,
    mois,
    libelle: "Indemnité de licenciement",
    lignes: [
      { compte: "641", sens: "debit", montant: indemnite },
      { compte: "512", sens: "credit", montant: indemnite },
    ],
  };
}

export type EvaluationLicenciement =
  | { readonly ok: true; readonly indemnite: Centimes }
  | {
      readonly ok: false;
      readonly code: "tresorerie_insuffisante";
      readonly message: string;
      readonly indemnite: Centimes;
      readonly manque: Centimes;
    };

/** Le licenciement est refusé, chiffre à l'appui, si la banque ne couvre pas l'indemnité. */
export function evaluerLicenciement(
  salarie: Salarie,
  tresorerie: Centimes,
  p: ParametresLicenciement,
): EvaluationLicenciement {
  const indemnite = indemniteLicenciement(salarie, p);
  if (tresorerie < indemnite) {
    const manque = centimes(indemnite - Math.max(0, tresorerie));
    return {
      ok: false,
      code: "tresorerie_insuffisante",
      message:
        `L'indemnité de licenciement légale est de ${(indemnite / 100).toFixed(2).replace(".", ",")} € ` +
        `et votre trésorerie ne la couvre pas : il manque ${(manque / 100).toFixed(2).replace(".", ",")} €.`,
      indemnite,
      manque,
    };
  }
  return { ok: true, indemnite };
}
