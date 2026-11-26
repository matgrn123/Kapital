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
  /** Délai de fabrication et livraison en heures réelles (faconniers.delai_heures) : Portugal 6 h, Turquie 8 h. */
  readonly delaiHeures: number;
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
  /** Instant de la commande, en heure du jeu (ms depuis le 1er janvier 1970 UTC). */
  readonly instantCommandeMs: number;
  /** Instant de livraison prévu : commande + délai du façonnier. */
  readonly instantLivraisonPrevuMs: number;
  readonly moisCommande: MoisJeu;
  /** Mois de jeu de la livraison (celui de son instant) : mois de l'écriture 35/31/401. */
  readonly moisLivraisonPrevu: MoisJeu;
  readonly statut: StatutOrdreFaconnier;
};

export class ErreurFaconnier extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurFaconnier";
  }
}
