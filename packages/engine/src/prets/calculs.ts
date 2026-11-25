import { enregistrer, type GrandLivre } from "../comptabilite/index.js";
import { centimes, type Centimes, type MoisJeu } from "../types/primitifs.js";

export type EcheancePret = {
  readonly numero: number;
  readonly montant: Centimes;
  readonly interets: Centimes;
  readonly amortissement: Centimes;
  readonly capitalRestantApres: Centimes;
};

export function mensualite(
  capital: Centimes,
  tauxAnnuel: number,
  dureeMois: number,
): Centimes {
  if (capital <= 0) {
    throw new Error("capital doit être > 0");
  }
  if (dureeMois <= 0 || !Number.isInteger(dureeMois)) {
    throw new Error("dureeMois doit être un entier > 0");
  }
  if (tauxAnnuel < 0) {
    throw new Error("tauxAnnuel doit être >= 0");
  }
  if (tauxAnnuel === 0) {
    return centimes(Math.round(capital / dureeMois));
  }
  const i = tauxAnnuel / 12;
  const facteur = i / (1 - Math.pow(1 + i, -dureeMois));
  return centimes(Math.round(capital * facteur));
}

export function genererEcheancier(
  capital: Centimes,
  tauxAnnuel: number,
  dureeMois: number,
): readonly EcheancePret[] {
  const mens = mensualite(capital, tauxAnnuel, dureeMois);
  const i = tauxAnnuel / 12;
  const result: EcheancePret[] = [];
  let capRestant: number = capital;

  for (let k = 1; k < dureeMois; k++) {
    const interets = Math.round(capRestant * i);
    const amortissement = mens - interets;
    capRestant = capRestant - amortissement;
    result.push({
      numero: k,
      montant: mens,
      interets: centimes(interets),
      amortissement: centimes(amortissement),
      capitalRestantApres: centimes(capRestant),
    });
  }
  // dernière échéance : rembourse tout le capital restant (ajuste l'arrondi)
  const interetsFinal = Math.round(capRestant * i);
  result.push({
    numero: dureeMois,
    montant: centimes(capRestant + interetsFinal),
    interets: centimes(interetsFinal),
    amortissement: centimes(capRestant),
    capitalRestantApres: centimes(0),
  });
  return result;
}

export type EntreesDeblocagePret = {
  readonly idEcriture: string;
  readonly mois: MoisJeu;
  readonly capital: Centimes;
};

export function enregistrerDeblocagePret(
  gl: GrandLivre,
  e: EntreesDeblocagePret,
): GrandLivre {
  return enregistrer(gl, {
    id: e.idEcriture,
    mois: e.mois,
    libelle: "Mise à disposition du prêt",
    lignes: [
      { compte: "512", sens: "debit", montant: e.capital },
      { compte: "164", sens: "credit", montant: e.capital },
    ],
  });
}

export type EntreesEcheance = {
  readonly idEcriture: string;
  readonly mois: MoisJeu;
  readonly echeance: EcheancePret;
};

export function enregistrerEcheance(
  gl: GrandLivre,
  e: EntreesEcheance,
): GrandLivre {
  return enregistrer(gl, {
    id: e.idEcriture,
    mois: e.mois,
    libelle: `Échéance prêt n°${e.echeance.numero}`,
    lignes: [
      { compte: "164", sens: "debit", montant: e.echeance.amortissement },
      { compte: "661", sens: "debit", montant: e.echeance.interets },
      { compte: "512", sens: "credit", montant: e.echeance.montant },
    ],
  });
}
