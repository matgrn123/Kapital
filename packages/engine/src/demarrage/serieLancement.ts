import type { Parametres } from "@kapital/content";
import type { EcritureComptable } from "../comptabilite/types.js";
import {
  centimes,
  type Centimes,
  type IdProduit,
  type MoisJeu,
} from "../types/primitifs.js";
import { ErreurDemarrage } from "./erreurs.js";

/** Nombre de pièces de la série de lancement : un paramètre, jamais une valeur en dur. */
export function quantiteSerieLancement(params: Parametres): number {
  const p = params["serie_lancement_pieces"];
  if (!p) throw new ErreurDemarrage("Paramètre manquant : serie_lancement_pieces.");
  if (!Number.isInteger(p.valeur) || p.valeur <= 0) {
    throw new ErreurDemarrage(
      `serie_lancement_pieces doit être un entier strictement positif, reçu ${p.valeur}.`,
    );
  }
  return p.valeur;
}

export type EntreesSerieLancement = {
  readonly params: Parametres;
  readonly produit: IdProduit;
  /** Coût de revient d'une pièce. */
  readonly coutUnitaire: Centimes;
  readonly mois: MoisJeu;
};

export type SerieLancement = {
  readonly produit: IdProduit;
  readonly quantite: number;
  readonly valeurTotale: Centimes;
  /** 35 Stock de produits finis (débit) / 512 Banque (crédit). */
  readonly ecriture: EcritureComptable;
};

/**
 * La société naît avec une collection préparée par le fondateur : des pièces
 * prêtes à vendre, payées sur le capital de départ. L'identifiant de l'écriture
 * est stable par produit, pour qu'une série ne soit jamais comptée deux fois.
 */
export function preparerSerieLancement(e: EntreesSerieLancement): SerieLancement {
  if (!Number.isInteger(e.coutUnitaire) || e.coutUnitaire <= 0) {
    throw new ErreurDemarrage(
      `Série de lancement ${e.produit} : le coût de revient doit être un entier positif, reçu ${e.coutUnitaire}.`,
    );
  }
  const quantite = quantiteSerieLancement(e.params);
  const valeurTotale = centimes(quantite * e.coutUnitaire);
  return {
    produit: e.produit,
    quantite,
    valeurTotale,
    ecriture: {
      id: `serie_lancement_${e.produit}`,
      mois: e.mois,
      libelle: `Série de lancement : ${quantite} ${e.produit}`,
      lignes: [
        { compte: "35", sens: "debit", montant: valeurTotale },
        { compte: "512", sens: "credit", montant: valeurTotale },
      ],
    },
  };
}
