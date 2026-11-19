import type { Entreprise, Gamme } from "./entreprise.js";
import type { Centimes, IdMatiere, MoisJeu } from "./primitifs.js";

export type SegmentMarche = Gamme;

export type PrixMatiereMois = {
  readonly matiere: IdMatiere;
  readonly prixParUnite: Centimes;
};

export type Frange = {
  readonly segment: SegmentMarche;
  readonly partDeMarche: number;
  readonly prixMoyen: Centimes;
};

export type Evenement = {
  readonly id: string;
  readonly debut: MoisJeu;
  readonly dureeMois: number;
  readonly description: string;
};

export type Monde = {
  readonly moisCourant: MoisJeu;
  readonly entreprises: readonly Entreprise[];
  readonly prixMatieres: readonly PrixMatiereMois[];
  readonly franges: readonly Frange[];
  readonly evenements: readonly Evenement[];
};
