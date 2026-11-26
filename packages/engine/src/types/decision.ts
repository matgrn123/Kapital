import type { Canal, ObjetPret, Poste } from "./entreprise.js";
import type {
  Centimes,
  IdEntreprise,
  IdFaconnier,
  IdFournisseur,
  IdMatiere,
  IdProduit,
  IdSalarie,
} from "./primitifs.js";

export type DecisionChangerPrix = {
  readonly type: "changer_prix";
  readonly produit: IdProduit;
  readonly canal: Canal;
  readonly prix: Centimes;
};

export type DecisionCommanderMatiere = {
  readonly type: "commander_matiere";
  readonly matiere: IdMatiere;
  readonly quantite: number;
  readonly fournisseur: IdFournisseur;
};

export type LieuProduction =
  | { readonly type: "atelier" }
  | { readonly type: "faconnier"; readonly faconnier: IdFaconnier };

export type DecisionOrdreProduction = {
  readonly type: "ordre_production";
  readonly produit: IdProduit;
  readonly quantite: number;
  readonly lieu: LieuProduction;
};

export type ActionMarketing =
  | "publicite"
  | "image_marque"
  | "promotion"
  | "relations_presse"
  // Nouvelles publicités : influenceurs (petit, moyen, gros compte, effet incertain),
  // réseaux sociaux, affichage dans le métro, campagne confiée à une agence.
  | "influenceur_nano"
  | "influenceur_micro"
  | "influenceur_macro"
  | "reseaux_sociaux"
  | "affichage_metro"
  | "agence_publicite";

export type DecisionActionMarketing = {
  readonly type: "action_marketing";
  readonly action: ActionMarketing;
  readonly montant: Centimes;
};

export type DecisionEmbauche = {
  readonly type: "embauche";
  readonly poste: Poste;
  readonly salaireBrutMensuel: Centimes;
};

export type DecisionLicenciement = {
  readonly type: "licenciement";
  readonly salarie: IdSalarie;
};

export type DecisionDemandePret = {
  readonly type: "demande_pret";
  readonly objet: ObjetPret;
  readonly montant: Centimes;
  readonly dureeMois: number;
};

export type Decision =
  | DecisionChangerPrix
  | DecisionCommanderMatiere
  | DecisionOrdreProduction
  | DecisionActionMarketing
  | DecisionEmbauche
  | DecisionLicenciement
  | DecisionDemandePret;

export type DecisionsEntreprise = {
  readonly entreprise: IdEntreprise;
  readonly decisions: readonly Decision[];
};
