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
  /** Délai de livraison en heures réelles (suppliers.delai_heures) : France 2 h, Portugal 4 h, Turquie 6 h. */
  readonly delaiHeures: number;
  readonly fiabilite: number;
  readonly minimumCommande: number;
  /** Le paiement reste calé sur les mois : réglé à la fin du mois de livraison + ce délai. */
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
  /** Instant de la commande, en heure du jeu (ms depuis le 1er janvier 1970 UTC). */
  readonly instantCommandeMs: number;
  /** Instant de livraison prévu : commande + délai du fournisseur. */
  readonly instantLivraisonPrevuMs: number;
  /** Mois de jeu de la commande (celui de son instant). */
  readonly moisCommande: MoisJeu;
  /** Mois de jeu de la livraison (celui de son instant) : mois de l'écriture 31/401. */
  readonly moisLivraisonPrevu: MoisJeu;
  readonly statut: StatutCommande;
};

export class ErreurCommande extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurCommande";
  }
}
