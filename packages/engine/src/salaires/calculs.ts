import type { Parametres } from "@kapital/content";
import { enregistrer, type GrandLivre } from "../comptabilite/index.js";
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
