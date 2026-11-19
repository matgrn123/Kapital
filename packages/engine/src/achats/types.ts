import type {
  Centimes,
  IdEntreprise,
  IdFournisseur,
  IdMatiere,
  MoisJeu,
} from "../types/primitifs.js";

export type Fournisseur = {
  readonly id: IdFournisseur;
  readonly nom: string;
  readonly qualite: number;
  readonly delaiMois: number;
  readonly fiabilite: number;
  readonly minimumCommande: number;
  readonly delaiPaiementMois: number;
};

export type LigneCatalogue = {
  readonly matiere: IdMatiere;
  readonly prix: Centimes;
};

export type CatalogueFournisseur = {
  readonly fournisseur: IdFournisseur;
  readonly lignes: readonly LigneCatalogue[];
};

export type StatutCommande = "en_cours" | "livree";

export type CommandeMatiere = {
  readonly id: string;
  readonly entreprise: IdEntreprise;
  readonly fournisseur: IdFournisseur;
  readonly matiere: IdMatiere;
  readonly quantite: number;
  readonly prixUnitaire: Centimes;
  readonly moisCommande: MoisJeu;
  readonly moisLivraisonPrevu: MoisJeu;
  readonly statut: StatutCommande;
};

export class ErreurCommande extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurCommande";
  }
}
