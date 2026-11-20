import type { GrandLivre } from "../comptabilite/index.js";
import type { Monde } from "../types/monde.js";
import type {
  Centimes,
  IdEntreprise,
  IdMatiere,
  IdPret,
  InstantJeu,
} from "../types/primitifs.js";

// Un événement planifié = quelque chose dont l'horodatage est connu à
// l'avance et qui doit se déclencher à ce moment-là.
// À distinguer de monde.evenements (événements de monde type crise/opportunité).

export type EvenementBase = {
  readonly id: string;
  readonly instant: InstantJeu;
  readonly entreprise: IdEntreprise;
};

export type EvenementLivraisonMatiere = EvenementBase & {
  readonly type: "livraison_matiere";
  readonly commandeId: string;
  readonly matiere: IdMatiere;
  readonly quantite: number;
  readonly prixUnitaire: Centimes;
};

export type EvenementEcheancePret = EvenementBase & {
  readonly type: "echeance_pret";
  readonly pretId: IdPret;
  readonly numeroEcheance: number;
  readonly interets: Centimes;
  readonly amortissement: Centimes;
  readonly mensualite: Centimes;
};

export type EvenementPlanifie =
  | EvenementLivraisonMatiere
  | EvenementEcheancePret;

export type EtatMonde = {
  readonly instantCourant: InstantJeu;
  readonly monde: Monde;
  readonly grandLivres: Readonly<Record<IdEntreprise, GrandLivre>>;
  readonly evenementsPlanifies: readonly EvenementPlanifie[];
};
