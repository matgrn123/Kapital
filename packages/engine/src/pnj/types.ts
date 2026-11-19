import type { Gamme } from "../types/entreprise.js";
import type { Centimes, IdEntreprise } from "../types/primitifs.js";

export type EtatPnj = {
  readonly id: IdEntreprise;
  readonly gamme: Gamme;
  readonly qualite: number;
  readonly notoriete: number;
  readonly desirabilite: number;
  readonly presenceRevendeur: number;
  readonly prix: Centimes;
  readonly coutUnitaire: Centimes;
};

export type EtatSegmentBancEssai = {
  readonly partFrange: number;
  readonly partMaxFirme: number;
};

export type PasBancEssai = {
  readonly mois: number;
  readonly pnj: readonly EtatPnj[];
  readonly parSegment: Readonly<Record<Gamme, EtatSegmentBancEssai>>;
};
