/**
 * Journal d'événements (cahier des charges § 3 point 4 et § 4) : ce qui est arrivé à la
 * société pendant que le joueur n'était pas là. Le moteur ne décide rien ici : le serveur
 * constate, après coup, ce qu'un pas a changé, et l'enregistre dans la table `evenements`
 * (migration 0041).
 */

/** Types contrôlés : la contrainte de la table reprend exactement cette liste. */
export const TYPES_EVENEMENTS = [
  "livraison_matiere",
  "livraison_production",
  "rupture_stock",
  "decouvert",
  "creance_encaissee",
  "etape_franchie",
  "cloture_mois",
  "mission_validee",
] as const;

export type TypeEvenement = (typeof TYPES_EVENEMENTS)[number];

/** Valeur JSON (colonne `detail` en jsonb). */
export type ValeurJson =
  | string
  | number
  | boolean
  | null
  | readonly ValeurJson[]
  | { readonly [cle: string]: ValeurJson };

export type EvenementJournal = {
  readonly type: TypeEvenement;
  /**
   * Clé d'idempotence, unique par société : rejouer un pas redonne la même clé, et la base
   * ignore le doublon. Elle sert aussi à n'enregistrer qu'une rupture ou qu'un découvert par mois.
   */
  readonly cle: string;
  /** Mois de jeu où l'événement a lieu (compté depuis 0, comme worlds.mois_courant). */
  readonly moisJeu: number;
  /** Pas absolu sur l'horloge commune ; null hors du pas (mission validée sur le site). */
  readonly pas: number | null;
  /** Instant réel de l'événement, en ms. */
  readonly instantMs: number;
  /** Titre court de secours ; le site compose la phrase complète à partir de `detail`. */
  readonly titre: string;
  readonly detail: { readonly [cle: string]: ValeurJson };
};

/** Sommes payées par la clôture du mois (sorties de banque, compte 512), en centimes. */
export type PaiementsCloture = {
  readonly paie: number;
  readonly loyers: number;
  readonly echeances: number;
  readonly tva: number;
  readonly impot: number;
  readonly agios: number;
  readonly energie: number;
  readonly autres: number;
};

/** Contenu de `detail` pour un événement `cloture_mois` (lu par le site : lib/debrief.ts). */
export type DetailCloture = {
  readonly mois: number;
  readonly tresorerieDebut: number;
  readonly tresorerieFin: number;
  readonly chiffreAffairesHt: number;
  readonly produits: number;
  readonly charges: number;
  readonly resultat: number;
  readonly paiements: PaiementsCloture;
  readonly totalPaye: number;
  readonly piecesNonLivrees: number;
  readonly ventesPerdues: readonly { readonly produit: string; readonly manquantes: number }[];
  readonly explications: readonly { readonly cle: string; readonly message: string }[];
  readonly etapeAvant: number;
  readonly etapeApres: number;
  readonly moisDecouvertConsecutifs: number;
};
