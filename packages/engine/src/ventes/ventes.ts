import { enregistrer, type GrandLivre } from "../comptabilite/index.js";
import { centimes, type Centimes } from "../types/primitifs.js";
import type {
  EntreesEcritureRetour,
  EntreesEcritureVenteDirecte,
  EntreesEcritureVenteRevendeur,
  EntreesMargeRevendeur,
  EntreesMargeVenteDirecte,
} from "./types.js";

export function prixHtDepuisTtc(prixTtc: Centimes, tauxTva: number): Centimes {
  return centimes(Math.round(prixTtc / (1 + tauxTva)));
}

export function tvaSurPrixTtc(prixTtc: Centimes, tauxTva: number): Centimes {
  return centimes(prixTtc - prixHtDepuisTtc(prixTtc, tauxTva));
}

export function margeVenteDirecte(e: EntreesMargeVenteDirecte): Centimes {
  const prixHt = prixHtDepuisTtc(e.prixTtcUnitaire, e.tauxTva);
  const perteRetour = Math.round(
    e.tauxRetour * e.coutTraitementRetourUnitaire,
  );
  return centimes(prixHt - e.coutRevientUnitaire - perteRetour);
}

export function margeRevendeur(e: EntreesMargeRevendeur): Centimes {
  return centimes(e.prixGrosHtUnitaire - e.coutRevientUnitaire);
}

export function enregistrerVenteDirecte(
  gl: GrandLivre,
  e: EntreesEcritureVenteDirecte,
): GrandLivre {
  if (e.quantite <= 0) {
    throw new Error("quantité doit être strictement positive");
  }
  const totalTtc = centimes(e.prixTtcUnitaire * e.quantite);
  const prixHt = prixHtDepuisTtc(e.prixTtcUnitaire, e.tauxTva);
  const totalHt = centimes(prixHt * e.quantite);
  const totalTva = centimes(totalTtc - totalHt);
  const totalCout = e.coutRevientTotal ?? centimes(e.coutRevientUnitaire * e.quantite);
  return enregistrer(gl, {
    id: e.idEcriture,
    mois: e.mois,
    libelle: `Vente directe ${e.quantite} ${e.produit}`,
    lignes: [
      { compte: "512", sens: "debit", montant: totalTtc },
      { compte: "707", sens: "credit", montant: totalHt },
      { compte: "44571", sens: "credit", montant: totalTva },
      { compte: "7135", sens: "debit", montant: totalCout },
      { compte: "35", sens: "credit", montant: totalCout },
    ],
  });
}

export function enregistrerVenteRevendeur(
  gl: GrandLivre,
  e: EntreesEcritureVenteRevendeur,
): GrandLivre {
  if (e.quantite <= 0) {
    throw new Error("quantité doit être strictement positive");
  }
  const totalHt = centimes(e.prixGrosHtUnitaire * e.quantite);
  const totalCout = e.coutRevientTotal ?? centimes(e.coutRevientUnitaire * e.quantite);
  return enregistrer(gl, {
    id: e.idEcriture,
    mois: e.mois,
    libelle: `Vente revendeur ${e.quantite} ${e.produit}`,
    lignes: [
      { compte: "411", sens: "debit", montant: totalHt },
      { compte: "707", sens: "credit", montant: totalHt },
      { compte: "7135", sens: "debit", montant: totalCout },
      { compte: "35", sens: "credit", montant: totalCout },
    ],
  });
}

export function enregistrerRetour(
  gl: GrandLivre,
  e: EntreesEcritureRetour,
): GrandLivre {
  if (e.quantiteRetournee <= 0) {
    throw new Error("quantité retournée doit être strictement positive");
  }
  const totalTtc = centimes(e.prixTtcUnitaire * e.quantiteRetournee);
  const prixHt = prixHtDepuisTtc(e.prixTtcUnitaire, e.tauxTva);
  const totalHt = centimes(prixHt * e.quantiteRetournee);
  const totalTva = centimes(totalTtc - totalHt);
  const totalCout = centimes(e.coutRevientUnitaire * e.quantiteRetournee);
  const totalTraitement = centimes(
    e.coutTraitementRetourUnitaire * e.quantiteRetournee,
  );
  return enregistrer(gl, {
    id: e.idEcriture,
    mois: e.mois,
    libelle: `Retour ${e.quantiteRetournee} ${e.produit}`,
    lignes: [
      { compte: "707", sens: "debit", montant: totalHt },
      { compte: "44571", sens: "debit", montant: totalTva },
      { compte: "512", sens: "credit", montant: centimes(totalTtc + totalTraitement) },
      { compte: "6228", sens: "debit", montant: totalTraitement },
      { compte: "35", sens: "debit", montant: totalCout },
      { compte: "7135", sens: "credit", montant: totalCout },
    ],
  });
}
