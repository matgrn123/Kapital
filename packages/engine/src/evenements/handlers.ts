import { enregistrer, type GrandLivre } from "../comptabilite/index.js";
import type { Entreprise, LigneStockMatiere } from "../types/entreprise.js";
import type { Monde } from "../types/monde.js";
import {
  centimes,
  moisCourantDepuisInstant,
  type Centimes,
  type IdEntreprise,
  type IdMatiere,
  type InstantJeu,
} from "../types/primitifs.js";
import type {
  EvenementEcheancePret,
  EvenementLivraisonMatiere,
  EvenementPlanifie,
} from "./types.js";

type GrandLivres = Readonly<Record<IdEntreprise, GrandLivre>>;

function remplacerEntreprise(
  monde: Monde,
  id: IdEntreprise,
  mutateur: (e: Entreprise) => Entreprise,
): Monde {
  return {
    ...monde,
    entreprises: monde.entreprises.map((e) =>
      e.id === id ? mutateur(e) : e,
    ),
  };
}

function ajouterAuStockMatiere(
  stocks: readonly LigneStockMatiere[],
  matiere: IdMatiere,
  quantiteAjoutee: number,
  valeurAjoutee: Centimes,
): readonly LigneStockMatiere[] {
  const existant = stocks.find((s) => s.matiere === matiere);
  if (!existant) {
    return [
      ...stocks,
      {
        matiere,
        quantite: quantiteAjoutee,
        valeurTotale: valeurAjoutee,
      },
    ];
  }
  return stocks.map((s) =>
    s.matiere === matiere
      ? {
          matiere: s.matiere,
          quantite: s.quantite + quantiteAjoutee,
          valeurTotale: centimes(s.valeurTotale + valeurAjoutee),
        }
      : s,
  );
}

function appliquerLivraisonMatiere(
  monde: Monde,
  grandLivres: GrandLivres,
  ev: EvenementLivraisonMatiere,
): { monde: Monde; grandLivres: GrandLivres } {
  const valeurTotale = centimes(ev.prixUnitaire * ev.quantite);
  const nouveauMonde = remplacerEntreprise(monde, ev.entreprise, (e) => ({
    ...e,
    stocksMatiere: ajouterAuStockMatiere(
      e.stocksMatiere,
      ev.matiere,
      ev.quantite,
      valeurTotale,
    ),
  }));
  const gl = grandLivres[ev.entreprise];
  if (!gl) {
    throw new Error(`Pas de grand livre pour l'entreprise ${ev.entreprise}.`);
  }
  const glApres = enregistrer(gl, {
    id: `livraison_${ev.commandeId}`,
    mois: moisCourantDepuisInstant(ev.instant),
    libelle: `Livraison commande ${ev.commandeId} : ${ev.quantite} ${ev.matiere}`,
    lignes: [
      { compte: "31", sens: "debit", montant: valeurTotale },
      { compte: "401", sens: "credit", montant: valeurTotale },
    ],
  });
  return {
    monde: nouveauMonde,
    grandLivres: { ...grandLivres, [ev.entreprise]: glApres },
  };
}

function appliquerEcheancePret(
  monde: Monde,
  grandLivres: GrandLivres,
  ev: EvenementEcheancePret,
): { monde: Monde; grandLivres: GrandLivres } {
  const gl = grandLivres[ev.entreprise];
  if (!gl) {
    throw new Error(`Pas de grand livre pour l'entreprise ${ev.entreprise}.`);
  }
  const glApres = enregistrer(gl, {
    id: `echeance_${ev.pretId}_${ev.numeroEcheance}`,
    mois: moisCourantDepuisInstant(ev.instant),
    libelle: `Échéance prêt ${ev.pretId} n°${ev.numeroEcheance}`,
    lignes: [
      { compte: "164", sens: "debit", montant: ev.amortissement },
      { compte: "661", sens: "debit", montant: ev.interets },
      { compte: "512", sens: "credit", montant: ev.mensualite },
    ],
  });
  // Mettre à jour le capital restant du prêt dans l'entreprise
  const nouveauMonde = remplacerEntreprise(monde, ev.entreprise, (e) => ({
    ...e,
    prets: e.prets.map((p) =>
      p.id === ev.pretId
        ? {
            ...p,
            capitalRestant: centimes(
              Math.max(0, p.capitalRestant - ev.amortissement),
            ),
          }
        : p,
    ),
  }));
  return {
    monde: nouveauMonde,
    grandLivres: { ...grandLivres, [ev.entreprise]: glApres },
  };
}

export function appliquerEvenement(
  monde: Monde,
  grandLivres: GrandLivres,
  ev: EvenementPlanifie,
): { monde: Monde; grandLivres: GrandLivres } {
  switch (ev.type) {
    case "livraison_matiere":
      return appliquerLivraisonMatiere(monde, grandLivres, ev);
    case "echeance_pret":
      return appliquerEcheancePret(monde, grandLivres, ev);
  }
}

export type ResultatInstantAvance = {
  readonly monde: Monde;
  readonly grandLivres: GrandLivres;
  readonly instantAtteint: InstantJeu;
};
