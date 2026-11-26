import { enregistrer, type GrandLivre } from "../comptabilite/index.js";
import { moisDeLInstantMs } from "../moteur/temps.js";
import {
  centimes,
  type Centimes,
  type IdEntreprise,
  type IdMatiere,
  type MoisJeu,
} from "../types/primitifs.js";
import {
  ErreurCommande,
  type CatalogueFournisseur,
  type CommandeMatiere,
  type Fournisseur,
} from "./types.js";
import { livraisonApresHeures } from "./delais.js";

export function prixChezFournisseur(
  catalogue: CatalogueFournisseur,
  matiere: IdMatiere,
): Centimes | undefined {
  for (const ligne of catalogue.lignes) {
    if (ligne.matiere === matiere) return ligne.prix;
  }
  return undefined;
}

export type EntreesPasserCommande = {
  readonly id: string;
  readonly entreprise: IdEntreprise;
  readonly fournisseur: Fournisseur;
  readonly catalogue: CatalogueFournisseur;
  readonly matiere: IdMatiere;
  readonly quantite: number;
  /** Instant de la commande, en heure du jeu (ms). */
  readonly instantCommandeMs: number;
};

export function passerCommande(e: EntreesPasserCommande): CommandeMatiere {
  if (e.fournisseur.id !== e.catalogue.fournisseur) {
    throw new ErreurCommande(
      `Catalogue inconsistant : fournisseur ${e.fournisseur.id} vs catalogue ${e.catalogue.fournisseur}.`,
    );
  }
  if (e.quantite <= 0 || !Number.isFinite(e.quantite)) {
    throw new ErreurCommande(
      `Quantité doit être strictement positive, reçu ${e.quantite}.`,
    );
  }
  if (e.quantite < e.fournisseur.minimumCommande) {
    throw new ErreurCommande(
      `Commande ${e.id} : quantité ${e.quantite} sous le minimum du fournisseur (${e.fournisseur.minimumCommande}).`,
    );
  }
  const prix = prixChezFournisseur(e.catalogue, e.matiere);
  if (prix === undefined) {
    throw new ErreurCommande(
      `Commande ${e.id} : le fournisseur ${e.fournisseur.id} ne vend pas la matière ${e.matiere}.`,
    );
  }
  if (!Number.isFinite(e.fournisseur.delaiHeures) || e.fournisseur.delaiHeures < 0) {
    throw new ErreurCommande(
      `Commande ${e.id} : délai de livraison invalide chez ${e.fournisseur.id} (${e.fournisseur.delaiHeures} h).`,
    );
  }
  if (!Number.isFinite(e.instantCommandeMs)) {
    throw new ErreurCommande(`Commande ${e.id} : instant de commande invalide (${e.instantCommandeMs}).`);
  }
  const livraison = livraisonApresHeures(e.instantCommandeMs, e.fournisseur.delaiHeures);

  return {
    id: e.id,
    entreprise: e.entreprise,
    fournisseur: e.fournisseur.id,
    matiere: e.matiere,
    quantite: e.quantite,
    prixUnitaire: prix,
    instantCommandeMs: e.instantCommandeMs,
    instantLivraisonPrevuMs: livraison.instantLivraisonMs,
    moisCommande: moisDeLInstantMs(e.instantCommandeMs),
    moisLivraisonPrevu: livraison.moisLivraison,
    statut: "en_cours",
  };
}

export function commandesAArriver(
  commandes: readonly CommandeMatiere[],
  moisCourant: MoisJeu,
): readonly CommandeMatiere[] {
  return commandes.filter(
    (c) => c.statut === "en_cours" && c.moisLivraisonPrevu === moisCourant,
  );
}

export type ResultatLivraison = {
  readonly grandLivre: GrandLivre;
  readonly commande: CommandeMatiere;
};

export function livrer(
  gl: GrandLivre,
  commande: CommandeMatiere,
): ResultatLivraison {
  if (commande.statut === "livree") {
    throw new ErreurCommande(
      `Commande ${commande.id} déjà livrée, ne peut pas être livrée deux fois.`,
    );
  }
  const valeurTotale = centimes(commande.prixUnitaire * commande.quantite);
  const glApres = enregistrer(gl, {
    id: `livraison_${commande.id}`,
    mois: commande.moisLivraisonPrevu,
    libelle: `Livraison commande ${commande.id} : ${commande.quantite} de ${commande.matiere} chez ${commande.fournisseur}`,
    lignes: [
      { compte: "31", sens: "debit", montant: valeurTotale },
      { compte: "401", sens: "credit", montant: valeurTotale },
    ],
  });
  return {
    grandLivre: glApres,
    commande: { ...commande, statut: "livree" },
  };
}
