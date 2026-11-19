import type {
  Centimes,
  IdEntreprise,
  IdMatiere,
  IdPret,
  IdProduit,
  IdSalarie,
  MoisJeu,
} from "./primitifs.js";

export type Gamme = "entree" | "milieu" | "haut";
export type EtapeEntreprise = 0 | 1 | 2;
export type StatutEntreprise = "active" | "en_difficulte" | "liquidee";

export type Proprietaire =
  | { readonly type: "joueur"; readonly idProfil: string }
  | { readonly type: "pnj" };

export type Canal = "vente_directe" | "revendeur";

export type Poste = "artisan" | "encadrement";

export type Salarie = {
  readonly id: IdSalarie;
  readonly poste: Poste;
  readonly salaireBrutMensuel: Centimes;
  readonly ancienneteMois: number;
  readonly experienceMois: number;
};

export type Atelier = {
  readonly surfaceM2: number;
  readonly loyerMensuel: Centimes;
  readonly nombreMachines: number;
};

export type EtatMarque = {
  readonly notoriete: number;
  readonly desirabilite: number;
};

export type Pret = {
  readonly id: IdPret;
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

export type PrixParCanal = {
  readonly [K in Canal]: Centimes;
};

export type ProduitEntreprise = {
  readonly produit: IdProduit;
  readonly qualiteVisee: number;
  readonly prix: PrixParCanal;
  readonly productionMensuelleCible: number;
};

export type Entreprise = {
  readonly id: IdEntreprise;
  readonly nom: string;
  readonly gamme: Gamme;
  readonly etape: EtapeEntreprise;
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
};
