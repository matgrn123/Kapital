import type { Parametres } from "@kapital/content";
import {
  enregistrer,
  soldeCompte,
  type GrandLivre,
} from "../comptabilite/index.js";
import { centimes, type Centimes, type MoisJeu } from "../types/primitifs.js";

export type DeclarationTva = {
  readonly tvaCollectee: Centimes;
  readonly tvaDeductible: Centimes;
  readonly soldeNet: Centimes;
};

export function calculDeclarationTva(gl: GrandLivre): DeclarationTva {
  const collectee = soldeCompte(gl, "44571");
  const deductible = soldeCompte(gl, "44566");
  return {
    tvaCollectee: centimes(collectee),
    tvaDeductible: centimes(deductible),
    soldeNet: centimes(collectee - deductible),
  };
}

export type EntreesDeclarationTva = {
  readonly idEcriture: string;
  readonly mois: MoisJeu;
};

export function enregistrerDeclarationTva(
  gl: GrandLivre,
  e: EntreesDeclarationTva,
): GrandLivre {
  const d = calculDeclarationTva(gl);
  if (d.soldeNet <= 0) {
    return gl;
  }
  return enregistrer(gl, {
    id: e.idEcriture,
    mois: e.mois,
    libelle: "Déclaration trimestrielle de TVA",
    lignes: [
      { compte: "44571", sens: "debit", montant: d.tvaCollectee },
      { compte: "44566", sens: "credit", montant: d.tvaDeductible },
      { compte: "512", sens: "credit", montant: d.soldeNet },
    ],
  });
}

export type ParametresImpotSocietes = {
  readonly tauxReduit: number;
  readonly plafondReduit: Centimes;
  readonly tauxPlein: number;
};

export function calculImpotSocietes(
  resultatImposable: Centimes,
  p: ParametresImpotSocietes,
): Centimes {
  if (resultatImposable <= 0) return centimes(0);
  if (resultatImposable <= p.plafondReduit) {
    return centimes(Math.round(resultatImposable * p.tauxReduit));
  }
  const partReduite = p.plafondReduit;
  const partPlein = resultatImposable - p.plafondReduit;
  return centimes(
    Math.round(partReduite * p.tauxReduit + partPlein * p.tauxPlein),
  );
}

export type EntreesImpotSocietes = {
  readonly idEcriture: string;
  readonly mois: MoisJeu;
  readonly montant: Centimes;
};

export function enregistrerImpotSocietes(
  gl: GrandLivre,
  e: EntreesImpotSocietes,
): GrandLivre {
  if (e.montant <= 0) return gl;
  return enregistrer(gl, {
    id: e.idEcriture,
    mois: e.mois,
    libelle: "Impôt sur les sociétés annuel",
    lignes: [
      { compte: "695", sens: "debit", montant: e.montant },
      { compte: "444", sens: "credit", montant: e.montant },
    ],
  });
}

export function parametresIsDepuis(params: Parametres): ParametresImpotSocietes {
  const lire = (cle: string): number => {
    const p = params[cle];
    if (!p) throw new Error(`Paramètre manquant : ${cle}`);
    return p.valeur;
  };
  return {
    tauxReduit: lire("is_taux_reduit"),
    plafondReduit: centimes(lire("is_plafond_reduit")),
    tauxPlein: lire("is_taux_plein"),
  };
}
