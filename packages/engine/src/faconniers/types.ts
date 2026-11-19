import type {
  Centimes,
  IdEntreprise,
  IdFaconnier,
  IdProduit,
  MoisJeu,
} from "../types/primitifs.js";

export type LignePrixFaconnier = {
  readonly produit: IdProduit;
  readonly prixParPiece: Centimes;
};

export type Faconnier = {
  readonly id: IdFaconnier;
  readonly nom: string;
  readonly pays: string;
  readonly delaiMois: number;
  readonly fiabilite: number;
  readonly minimumCommande: number;
  readonly delaiPaiementMois: number;
  readonly prix: readonly LignePrixFaconnier[];
};

export type StatutOrdreFaconnier = "en_cours" | "livree";

export type OrdreFaconnier = {
  readonly id: string;
  readonly entreprise: IdEntreprise;
  readonly faconnier: IdFaconnier;
  readonly produit: IdProduit;
  readonly quantite: number;
  readonly prixFaconParPiece: Centimes;
  readonly moisCommande: MoisJeu;
  readonly moisLivraisonPrevu: MoisJeu;
  readonly statut: StatutOrdreFaconnier;
};

export class ErreurFaconnier extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurFaconnier";
  }
}
