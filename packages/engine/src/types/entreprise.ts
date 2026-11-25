import type {
  Centimes,
  IdEntreprise,
  IdMatiere,
  IdPret,
  IdProduit,
  IdSalarie,
  MoisJeu,
} from "./primitifs.js";
import type { MaterielAtelier, ModulePose } from "../atelier/effetsPlan.js";

export type Gamme = "entree" | "milieu" | "haut";
export type EtapeEntreprise = 0 | 1 | 2;
/**
 * Compteurs depuis la création, mis à jour à chaque clôture : ils servent à
 * constater le passage d'étape. Absents = 0 (entreprise créée avant AE-2).
 */
export type CumulsEtape = {
  /** Pièces vendues au total, tous canaux. */
  readonly piecesVendues: number;
  /** Chiffre d'affaires cumulé hors taxes, en centimes. */
  readonly chiffreAffairesHt: Centimes;
};

export type StatutEntreprise = "active" | "en_difficulte" | "liquidee";

export type Proprietaire =
  | { readonly type: "joueur"; readonly idProfil: string }
  | { readonly type: "pnj" };

/** AE-10 : la boutique est un troisième canal, servi par le stock propre de chaque point de vente. */
export type Canal = "vente_directe" | "revendeur" | "boutique";

/** AE-10 : un vendeur ne produit pas et n'occupe pas de poste de l'atelier ; il plafonne les ventes de la boutique. */
export type Poste = "artisan" | "encadrement" | "vendeur";

export type Salarie = {
  readonly id: IdSalarie;
  readonly poste: Poste;
  readonly salaireBrutMensuel: Centimes;
  readonly ancienneteMois: number;
  readonly experienceMois: number;
};

/** Bail d'un local (AE-5) : dépôt de garantie, charges, mois de fin quand le congé est donné. */
export type Bail = {
  /** Dépôt versé à la signature (compte 275), restitué à la fin du bail. */
  readonly depotGarantie: Centimes;
  /** Charges locatives mensuelles (compte 614). */
  readonly chargesMensuelles: Centimes;
  readonly moisSignature: MoisJeu;
  /** Dernier mois du bail (fin du préavis) ; null tant qu'aucun congé n'est donné. */
  readonly moisFin: MoisJeu | null;
};

/** Local acheté à crédit (AE-6) : immobilisation 213 amortie en 2813, plus de loyer. */
export type AchatLocal = {
  readonly prixAchat: Centimes;
  /** Part payée comptant ; le reste est un prêt immobilier. */
  readonly apport: Centimes;
  /** Charges d'entretien mensuelles du catalogue (compte 614). */
  readonly chargesMensuelles: Centimes;
  readonly moisAchat: MoisJeu;
  readonly dureeAmortissementMois: number;
};

export type Atelier = {
  readonly surfaceM2: number;
  readonly loyerMensuel: Centimes;
  /**
   * 3D-3 : modules posés dans l'atelier (table placed_modules), avec ce que le catalogue en dit.
   * Les postes équipés, le stockage et l'amortissement du matériel en découlent (atelier/effetsPlan).
   */
  readonly modules: readonly ModulePose[];
  /** Soldes 2154 / 2815 du grand livre ; absent = calculé depuis les modules achetés. */
  readonly materiel?: MaterielAtelier;
  /** Absent pour un atelier loué avant AE-5 : loyer seul, pas de dépôt. */
  readonly bail?: Bail;
  /** Présent pour un local acheté (loyerMensuel vaut alors 0, pas de bail). */
  readonly achat?: AchatLocal;
};

/**
 * AE-10 : boutique louée (table points_de_vente), distincte de l'atelier. Bail commercial
 * (loyer, charges, dépôt), un mois de travaux d'agencement (2135, amortis en 28135), puis
 * ouverture. Elle a son propre stock de produits finis, toujours au compte 35.
 */
export type PointDeVente = {
  readonly id: string;
  /** Emplacement du catalogue des bâtiments (catégorie boutique). */
  readonly batimentId: string;
  readonly surfaceM2: number;
  readonly loyerMensuel: Centimes;
  readonly chargesMensuelles: Centimes;
  /** Dépôt versé à la signature (compte 275). */
  readonly depotGarantie: Centimes;
  readonly moisSignature: MoisJeu;
  /** Premier mois de vente : signature + durée des travaux. Avant, aucune vente. */
  readonly moisOuverture: MoisJeu;
  /** Travaux d'agencement immobilisés (2135) et amortissements déjà passés (28135). */
  readonly agencement: {
    readonly valeurBrute: Centimes;
    readonly amortissementsCumules: Centimes;
    readonly dureeAmortissementMois: number;
  };
  /** Effet de l'emplacement (catalogue) : passants par jour. */
  readonly passantsParJour: number;
  /** Passants moyens des boutiques du catalogue : la demande est multipliée par passants / référence. */
  readonly passantsReference: number;
  /** Effet de l'emplacement (catalogue) : points de désirabilité ajoutés chaque mois d'ouverture. */
  readonly bonusDesirabiliteParMois: number;
  /** Stock propre de la boutique ; sa valeur reste au compte 35 de l'entreprise. */
  readonly stock: readonly LigneStockFini[];
};

export type EtatMarque = {
  readonly notoriete: number;
  readonly desirabilite: number;
};

/** À quoi sert un prêt : le plafond, la durée et la marge dépendent de l'objet (AE-4). */
export type ObjetPret = "tresorerie" | "equipement" | "immobilier";

export type Pret = {
  readonly id: IdPret;
  readonly objet: ObjetPret;
  readonly capitalInitial: Centimes;
  readonly capitalRestant: Centimes;
  readonly tauxAnnuel: number;
  readonly dureeTotaleMois: number;
  readonly moisDebut: MoisJeu;
};

export type LigneStockMatiere = {
  readonly matiere: IdMatiere;
  readonly quantite: number;
  readonly valeurTotale: Centimes;
};

export type LigneStockFini = {
  readonly produit: IdProduit;
  readonly quantite: number;
  readonly valeurTotale: Centimes;
};

/**
 * Prix TTC par canal. AE-10 : le prix boutique est facultatif ; absent, la boutique vend au
 * prix de la vente directe (voir prixBoutique dans boutique/).
 */
export type PrixParCanal = {
  readonly vente_directe: Centimes;
  readonly revendeur: Centimes;
  readonly boutique?: Centimes;
};

/** Nomenclature d'un produit (table products) : ce qu'une pièce consomme. */
export type FicheFabrication = {
  readonly matiere: IdMatiere;
  /** Unités de matière par pièce, avant chute. */
  readonly consommationParPiece: number;
  readonly fournituresParPiece: Centimes;
  readonly tempsStandardMinutes: number;
};

export type ProduitEntreprise = {
  readonly produit: IdProduit;
  readonly qualiteVisee: number;
  readonly prix: PrixParCanal;
  readonly productionMensuelleCible: number;
  /**
   * Nomenclature, obligatoire pour produire en atelier : sans elle, le moteur
   * refuse de produire (erreur explicite) plutôt que d'inventer une pièce à coût nul.
   */
  readonly fabrication?: FicheFabrication;
};

export type Entreprise = {
  readonly id: IdEntreprise;
  readonly nom: string;
  readonly gamme: Gamme;
  readonly etape: EtapeEntreprise;
  /** Compteurs de progression (voir CumulsEtape) ; absents = 0. */
  readonly cumulsEtape?: CumulsEtape;
  readonly proprietaire: Proprietaire;
  readonly statut: StatutEntreprise;
  readonly tresorerie: Centimes;
  readonly stocksMatiere: readonly LigneStockMatiere[];
  readonly stocksFinis: readonly LigneStockFini[];
  readonly salaries: readonly Salarie[];
  readonly atelier: Atelier | null;
  readonly marque: EtatMarque;
  readonly prets: readonly Pret[];
  readonly catalogue: readonly ProduitEntreprise[];
  /** AE-10 : boutiques de l'entreprise (absent = aucune). */
  readonly pointsDeVente?: readonly PointDeVente[];
};
