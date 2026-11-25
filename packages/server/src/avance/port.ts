import type {
  CreanceAEncaisser,
  CumulMois,
  DetteFournisseurEchue,
  DonneesFinMois,
  EcritureComptable,
  Entreprise,
  LivraisonFaconnier,
  LivraisonMatiere,
} from "@kapital/engine";
import type { EvenementJournal } from "../evenements/types.js";

/**
 * Ce dont l'orchestrateur a besoin pour lire et écrire le monde.
 * Une seule implémentation touche la vraie base (stockageSupabase.ts) ;
 * les tests utilisent une version en mémoire (stockageMemoire.ts).
 */

export type MondeActif = {
  readonly id: string;
  /** Mois de jeu en cours (nombre de mois déjà clos). */
  readonly moisCourant: number;
  /** Création du monde sur l'horloge commune, en ms ; null = ancien monde, pas encore initialisé. */
  readonly debutReelMs: number | null;
};

export type EntrepriseDuMonde = {
  readonly id: string;
  /** Nombre de pas déjà traités ; null = pas encore démarrée sur l'horloge commune. */
  readonly pasTraites: number | null;
};

export type LivraisonMatiereDatee = LivraisonMatiere & { readonly instantMs: number };
export type LivraisonFaconnierDatee = LivraisonFaconnier & { readonly instantMs: number };

export type LivraisonsEnAttente = {
  readonly matiere: readonly LivraisonMatiereDatee[];
  readonly faconniers: readonly LivraisonFaconnierDatee[];
};

export type EtatChargeEntreprise = {
  readonly entreprise: Entreprise;
  /** État du mois en cours, ou null s'il n'y en a pas (début de mois). */
  readonly cumul: CumulMois | null;
};

/** Tout ce qu'un lot de pas change pour une entreprise, à enregistrer d'un bloc. */
export type ResultatLotAEnregistrer = {
  readonly ecritures: readonly EcritureComptable[];
  /** État final : stocks, prêts, marque, statut. La trésorerie se déduit des écritures. */
  readonly entreprise: Entreprise;
  /** Renseigné seulement si le lot a clos un mois. */
  readonly moisDecouvertConsecutifs: number | null;
  readonly echeancesPayees: readonly { readonly pretId: string; readonly numero: number }[];
  readonly commandesMatiereLivrees: readonly string[];
  readonly ordresFaconnierLivres: readonly string[];
  /** État du mois à conserver, ou null si le mois est clos. */
  readonly cumul: CumulMois | null;
};

/** Un autre traitement a déjà appliqué ces pas : rien à faire, ce n'est pas une panne. */
export class ErreurPasDejaTraite extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurPasDejaTraite";
  }
}

export interface StockageMonde {
  chargerMondeActif(): Promise<MondeActif | null>;
  definirDebutReel(mondeId: string, debutReelMs: number): Promise<void>;
  definirMoisCourant(mondeId: string, mois: number): Promise<void>;
  /** Entreprises en activité (hors liquidées). */
  listerEntreprises(mondeId: string): Promise<readonly EntrepriseDuMonde[]>;
  /** Positionne une entreprise sur le pas courant, sans rejouer d'historique. */
  demarrerEntreprise(companyId: string, pas: number, cumul: CumulMois | null): Promise<void>;
  chargerEtat(companyId: string, moisEnCours: number): Promise<EtatChargeEntreprise>;
  /** Commandes en cours dont la livraison est prévue avant `avantMs`. */
  chargerLivraisons(companyId: string, avantMs: number): Promise<LivraisonsEnAttente>;
  /** Créances revendeurs à encaisser au premier pas du mois. */
  chargerCreances(companyId: string, moisEnCours: number): Promise<readonly CreanceAEncaisser[]>;
  /**
   * Dettes fournisseurs et façonniers dont l'échéance (mois de livraison + délai de
   * paiement) est atteinte au mois `moisEnCours` et pas encore réglées : payées au
   * premier pas du mois.
   */
  chargerDettesEchues(companyId: string, moisEnCours: number): Promise<readonly DetteFournisseurEchue[]>;
  /** TVA à payer et compteur de découvert, lus pour la clôture du mois. */
  chargerFinDeMois(companyId: string, moisEnCours: number): Promise<DonneesFinMois>;
  /**
   * Enregistre `nbPas` pas d'un coup, en tout ou rien. Lève ErreurPasDejaTraite
   * si le compteur de l'entreprise n'est pas `pasAttendu`.
   */
  appliquerPas(
    companyId: string,
    pasAttendu: number,
    nbPas: number,
    lot: ResultatLotAEnregistrer,
  ): Promise<void>;
  /**
   * Journal (migration 0041) : enregistre les événements d'un lot déjà appliqué.
   * Idempotent : un événement dont la clé existe déjà pour la société est ignoré.
   */
  enregistrerEvenements(companyId: string, evenements: readonly EvenementJournal[]): Promise<void>;
}
