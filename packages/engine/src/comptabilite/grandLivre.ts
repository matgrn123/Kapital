import type { Centimes } from "../types/primitifs.js";
import {
  ComptabiliteError,
  type Compte,
  type EcritureComptable,
  type GrandLivre,
  type NumeroCompte,
  type SensEcriture,
  type TypeCompte,
} from "./types.js";

const COTE_NORMAL: Readonly<Record<TypeCompte, SensEcriture>> = {
  actif: "debit",
  passif: "credit",
  charges: "debit",
  produits: "credit",
};

export function grandLivreVide(): GrandLivre {
  return { comptes: {}, ecritures: [] };
}

export function ajouterCompte(gl: GrandLivre, compte: Compte): GrandLivre {
  if (compte.numero in gl.comptes) {
    throw new ComptabiliteError(
      `Compte "${compte.numero}" déjà présent dans le plan.`,
    );
  }
  return {
    ...gl,
    comptes: { ...gl.comptes, [compte.numero]: compte },
  };
}

export function ajouterComptes(
  gl: GrandLivre,
  comptes: readonly Compte[],
): GrandLivre {
  return comptes.reduce(ajouterCompte, gl);
}

export function enregistrer(
  gl: GrandLivre,
  ecriture: EcritureComptable,
): GrandLivre {
  if (ecriture.lignes.length < 2) {
    throw new ComptabiliteError(
      `Écriture "${ecriture.libelle}" : une écriture en partie double exige au moins deux lignes.`,
    );
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const ligne of ecriture.lignes) {
    if (!(ligne.compte in gl.comptes)) {
      throw new ComptabiliteError(
        `Écriture "${ecriture.libelle}" : compte inconnu "${ligne.compte}".`,
      );
    }
    if (ligne.montant <= 0) {
      throw new ComptabiliteError(
        `Écriture "${ecriture.libelle}" : montant doit être strictement positif, reçu ${ligne.montant}.`,
      );
    }
    if (ligne.sens === "debit") {
      totalDebit += ligne.montant;
    } else {
      totalCredit += ligne.montant;
    }
  }

  if (totalDebit !== totalCredit) {
    throw new ComptabiliteError(
      `Écriture "${ecriture.libelle}" déséquilibrée : débits ${totalDebit}, crédits ${totalCredit}.`,
    );
  }

  return {
    ...gl,
    ecritures: [...gl.ecritures, ecriture],
  };
}

export function soldeCompte(
  gl: GrandLivre,
  numero: NumeroCompte,
): Centimes {
  const compte = gl.comptes[numero];
  if (!compte) {
    throw new ComptabiliteError(`Compte "${numero}" introuvable.`);
  }
  const coteNormal = COTE_NORMAL[compte.type];
  let total = 0;
  for (const ec of gl.ecritures) {
    for (const ligne of ec.lignes) {
      if (ligne.compte !== numero) continue;
      total += ligne.sens === coteNormal ? ligne.montant : -ligne.montant;
    }
  }
  return total as Centimes;
}

export function totalParType(gl: GrandLivre, t: TypeCompte): Centimes {
  const coteNormal = COTE_NORMAL[t];
  let total = 0;
  for (const ec of gl.ecritures) {
    for (const ligne of ec.lignes) {
      const compte = gl.comptes[ligne.compte];
      if (!compte || compte.type !== t) continue;
      total += ligne.sens === coteNormal ? ligne.montant : -ligne.montant;
    }
  }
  return total as Centimes;
}

export function totalActif(gl: GrandLivre): Centimes {
  return totalParType(gl, "actif");
}

export function totalPassif(gl: GrandLivre): Centimes {
  return totalParType(gl, "passif");
}

export function totalCharges(gl: GrandLivre): Centimes {
  return totalParType(gl, "charges");
}

export function totalProduits(gl: GrandLivre): Centimes {
  return totalParType(gl, "produits");
}

export function resultat(gl: GrandLivre): Centimes {
  return (totalProduits(gl) - totalCharges(gl)) as Centimes;
}

export function enEquilibre(gl: GrandLivre): boolean {
  return totalActif(gl) === totalPassif(gl) + resultat(gl);
}
