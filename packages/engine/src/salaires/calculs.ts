import { eurosTexte } from "../types/euros.js";
import type { Parametres } from "@kapital/content";
import { enregistrer, type EcritureComptable, type GrandLivre } from "../comptabilite/index.js";
import { centimes, type Centimes, type MoisJeu } from "../types/primitifs.js";

export type EntreesTauxCotisations = {
  readonly salaireBrutMensuel: Centimes;
  readonly smicMensuelBrut: Centimes;
  readonly tauxCotisationsSmic: number;
  readonly tauxCotisationsPleines: number;
  readonly seuilCotisationsPleinesEnSmic: number;
};

export function tauxCotisations(e: EntreesTauxCotisations): number {
  if (e.salaireBrutMensuel < 0) {
    throw new Error("salaire brut doit être >= 0");
  }
  if (e.smicMensuelBrut <= 0) {
    throw new Error("smic mensuel brut doit être > 0");
  }
  const niveau = e.salaireBrutMensuel / e.smicMensuelBrut;
  if (niveau <= 1) return e.tauxCotisationsSmic;
  if (niveau >= e.seuilCotisationsPleinesEnSmic) return e.tauxCotisationsPleines;
  const progression = (niveau - 1) / (e.seuilCotisationsPleinesEnSmic - 1);
  return (
    e.tauxCotisationsSmic +
    progression * (e.tauxCotisationsPleines - e.tauxCotisationsSmic)
  );
}

export type EntreesCoutEmployeur = EntreesTauxCotisations;

export function cotisationsPatronales(e: EntreesCoutEmployeur): Centimes {
  const taux = tauxCotisations(e);
  return centimes(Math.round(e.salaireBrutMensuel * taux));
}

export function coutEmployeur(e: EntreesCoutEmployeur): Centimes {
  const cot = cotisationsPatronales(e);
  return centimes(e.salaireBrutMensuel + cot);
}

export type EntreesPaie = {
  readonly idEcriture: string;
  readonly mois: MoisJeu;
  readonly salaireBrutMensuel: Centimes;
  readonly cotisationsPatronales: Centimes;
  readonly libelle?: string;
};

export function enregistrerPaieMensuelle(
  gl: GrandLivre,
  e: EntreesPaie,
): GrandLivre {
  if (e.salaireBrutMensuel <= 0) {
    throw new Error("salaire brut à payer doit être > 0");
  }
  return enregistrer(gl, {
    id: e.idEcriture,
    mois: e.mois,
    libelle: e.libelle ?? "Paie mensuelle",
    lignes: [
      { compte: "641", sens: "debit", montant: e.salaireBrutMensuel },
      { compte: "645", sens: "debit", montant: e.cotisationsPatronales },
      { compte: "421", sens: "credit", montant: e.salaireBrutMensuel },
      { compte: "431", sens: "credit", montant: e.cotisationsPatronales },
    ],
  });
}

export type CoefficientsSalaires = {
  readonly smicMensuelBrut: Centimes;
  readonly tauxCotisationsSmic: number;
  readonly tauxCotisationsPleines: number;
  readonly seuilCotisationsPleinesEnSmic: number;
};

export function coefficientsSalairesDepuisParametres(
  params: Parametres,
): CoefficientsSalaires {
  const lire = (cle: string): number => {
    const p = params[cle];
    if (!p) throw new Error(`Paramètre manquant : ${cle}`);
    return p.valeur;
  };
  return {
    smicMensuelBrut: centimes(lire("smic_mensuel_brut")),
    tauxCotisationsSmic: lire("taux_cotisations_au_smic"),
    tauxCotisationsPleines: lire("taux_cotisations_au_dela_1_6_smic"),
    seuilCotisationsPleinesEnSmic: lire("seuil_cotisations_pleines_en_smic"),
  };
}

export type EntreesPaiementPaie = {
  readonly idEcriture: string;
  readonly mois: MoisJeu;
  readonly salaireBrutMensuel: Centimes;
  readonly cotisationsPatronales: Centimes;
  readonly libelle: string;
};

/** Paiement de la paie : 421 (salaire) + 431 (cotisations) au débit, 512 (banque) au crédit. */
export function ecriturePaiementPaie(e: EntreesPaiementPaie): EcritureComptable {
  return {
    id: e.idEcriture,
    mois: e.mois,
    libelle: e.libelle,
    lignes: [
      { compte: "421", sens: "debit", montant: e.salaireBrutMensuel },
      { compte: "431", sens: "debit", montant: e.cotisationsPatronales },
      {
        compte: "512",
        sens: "credit",
        montant: centimes(e.salaireBrutMensuel + e.cotisationsPatronales),
      },
    ],
  };
}

export type RefusEmbauche =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "salaire_invalide" | "salaire_sous_smic" | "tresorerie_insuffisante";
      readonly message: string;
      /** Ce qui manque, en centimes. */
      readonly manque: number;
    };

const eurosFr = eurosTexte;

/**
 * Évalue une embauche : salaire entier strictement positif, au moins égal au SMIC mensuel
 * brut, et trésorerie couvrant `moisReserve` mois de coût employeur (salaire + cotisations
 * patronales calculées par le moteur).
 */
export function evaluerEmbauche(
  salaireBrutMensuel: number,
  tresorerie: number,
  coeffs: CoefficientsSalaires,
  moisReserve: number,
): RefusEmbauche {
  if (!Number.isInteger(salaireBrutMensuel) || salaireBrutMensuel <= 0) {
    return {
      ok: false,
      code: "salaire_invalide",
      message: `Le salaire brut mensuel doit être strictement positif (reçu ${salaireBrutMensuel} centimes).`,
      manque: 0,
    };
  }
  if (salaireBrutMensuel < coeffs.smicMensuelBrut) {
    const manque = coeffs.smicMensuelBrut - salaireBrutMensuel;
    return {
      ok: false,
      code: "salaire_sous_smic",
      message: `Le salaire proposé (${eurosFr(salaireBrutMensuel)} brut par mois) est sous le SMIC (${eurosFr(coeffs.smicMensuelBrut)}) : il manque ${eurosFr(manque)}.`,
      manque,
    };
  }
  const cout = coutEmployeur({ salaireBrutMensuel: centimes(salaireBrutMensuel), ...coeffs });
  const reserve = Math.round(cout * moisReserve);
  if (tresorerie < reserve) {
    const manque = reserve - tresorerie;
    return {
      ok: false,
      code: "tresorerie_insuffisante",
      message: `Il faut au moins ${moisReserve} mois de coût employeur (${eurosFr(cout)} par mois) en réserve avant d'embaucher. Il manque ${eurosFr(manque)}.`,
      manque,
    };
  }
  return { ok: true };
}
