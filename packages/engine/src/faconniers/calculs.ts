import { enregistrer, type GrandLivre } from "../comptabilite/index.js";
import { livraisonApresHeures } from "../achats/delais.js";
import { moisDeLInstantMs } from "../moteur/temps.js";
import {
  centimes,
  type Centimes,
  type IdEntreprise,
  type IdProduit,
  type MoisJeu,
} from "../types/primitifs.js";
import {
  ErreurFaconnier,
  type Faconnier,
  type OrdreFaconnier,
} from "./types.js";

export function prixChezFaconnier(
  faconnier: Faconnier,
  produit: IdProduit,
): Centimes | undefined {
  for (const ligne of faconnier.prix) {
    if (ligne.produit === produit) return ligne.prixParPiece;
  }
  return undefined;
}

export type EntreesOrdreFaconnier = {
  readonly id: string;
  readonly entreprise: IdEntreprise;
  readonly faconnier: Faconnier;
  readonly produit: IdProduit;
  readonly quantite: number;
  /** Instant de la commande, en heure du jeu (ms). */
  readonly instantCommandeMs: number;
};

export function passerOrdreFaconnier(
  e: EntreesOrdreFaconnier,
): OrdreFaconnier {
  if (e.quantite <= 0 || !Number.isFinite(e.quantite)) {
    throw new ErreurFaconnier(
      `Ordre ${e.id} : quantité doit être strictement positive, reçu ${e.quantite}.`,
    );
  }
  if (e.quantite < e.faconnier.minimumCommande) {
    throw new ErreurFaconnier(
      `Ordre ${e.id} : quantité ${e.quantite} sous le minimum du façonnier (${e.faconnier.minimumCommande}).`,
    );
  }
  const prix = prixChezFaconnier(e.faconnier, e.produit);
  if (prix === undefined) {
    throw new ErreurFaconnier(
      `Ordre ${e.id} : le façonnier ${e.faconnier.id} ne fabrique pas le produit ${e.produit}.`,
    );
  }
  if (!Number.isFinite(e.faconnier.delaiHeures) || e.faconnier.delaiHeures < 0) {
    throw new ErreurFaconnier(
      `Ordre ${e.id} : délai de livraison invalide chez ${e.faconnier.id} (${e.faconnier.delaiHeures} h).`,
    );
  }
  if (!Number.isFinite(e.instantCommandeMs)) {
    throw new ErreurFaconnier(`Ordre ${e.id} : instant de commande invalide (${e.instantCommandeMs}).`);
  }
  const livraison = livraisonApresHeures(e.instantCommandeMs, e.faconnier.delaiHeures);
  return {
    id: e.id,
    entreprise: e.entreprise,
    faconnier: e.faconnier.id,
    produit: e.produit,
    quantite: e.quantite,
    prixFaconParPiece: prix,
    instantCommandeMs: e.instantCommandeMs,
    instantLivraisonPrevuMs: livraison.instantLivraisonMs,
    moisCommande: moisDeLInstantMs(e.instantCommandeMs),
    moisLivraisonPrevu: livraison.moisLivraison,
    statut: "en_cours",
  };
}

export type EntreesCoutRevientFaconnier = {
  readonly prixMatiereParUnite: Centimes;
  readonly consommationParPiece: number;
  readonly tauxChute: number;
  readonly fournitures: Centimes;
  readonly prixFaconParPiece: Centimes;
};

export function coutRevientFaconnier(
  e: EntreesCoutRevientFaconnier,
): Centimes {
  const matiere =
    e.prixMatiereParUnite * e.consommationParPiece * (1 + e.tauxChute);
  return centimes(Math.round(matiere + e.fournitures + e.prixFaconParPiece));
}

export type EntreesLivraisonFaconnier = {
  readonly grandLivre: GrandLivre;
  readonly ordre: OrdreFaconnier;
  readonly coutMatiereParPiece: Centimes;
};

export type ResultatLivraisonFaconnier = {
  readonly grandLivre: GrandLivre;
  readonly ordre: OrdreFaconnier;
};

export function livrerFaconnier(
  e: EntreesLivraisonFaconnier,
): ResultatLivraisonFaconnier {
  if (e.ordre.statut === "livree") {
    throw new ErreurFaconnier(
      `Ordre ${e.ordre.id} déjà livré.`,
    );
  }
  const totalMatiere = centimes(e.coutMatiereParPiece * e.ordre.quantite);
  const totalFacon = centimes(e.ordre.prixFaconParPiece * e.ordre.quantite);
  const totalProduitsFinis = centimes(totalMatiere + totalFacon);
  const glApres = enregistrer(e.grandLivre, {
    id: `livraison_faconnier_${e.ordre.id}`,
    mois: e.ordre.moisLivraisonPrevu,
    libelle: `Livraison façonnier ${e.ordre.faconnier} : ${e.ordre.quantite} ${e.ordre.produit}`,
    lignes: [
      { compte: "35", sens: "debit", montant: totalProduitsFinis },
      { compte: "31", sens: "credit", montant: totalMatiere },
      { compte: "401", sens: "credit", montant: totalFacon },
    ],
  });
  return {
    grandLivre: glApres,
    ordre: { ...e.ordre, statut: "livree" },
  };
}
