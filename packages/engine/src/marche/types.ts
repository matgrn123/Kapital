import type { Gamme } from "../types/entreprise.js";
import type { Centimes, IdEntreprise } from "../types/primitifs.js";

export type CoefficientsAttraction = {
  readonly qualite: number;
  readonly notoriete: number;
  readonly desirabilite: number;
  readonly presenceRevendeur: number;
  readonly prix: number;
};

export type OffreEntreprise = {
  readonly entreprise: IdEntreprise;
  readonly qualite: number;
  readonly notoriete: number;
  readonly desirabilite: number;
  readonly presenceRevendeur: number;
  readonly prix: Centimes;
};

export type OffreFrange = {
  readonly qualite: number;
  readonly notoriete: number;
  readonly desirabilite: number;
  readonly presenceRevendeur: number;
  readonly prix: Centimes;
};

export type SegmentAttraction = {
  readonly gamme: Gamme;
  readonly prixReference: Centimes;
  readonly coefficients: CoefficientsAttraction;
  readonly frange: OffreFrange;
};

export type PartsSegment = {
  readonly parts: Readonly<Record<string, number>>;
  readonly partFrange: number;
};
