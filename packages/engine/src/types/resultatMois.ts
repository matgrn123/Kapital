import type { Centimes, IdEntreprise, MoisJeu } from "./primitifs.js";

export type Explication = {
  readonly cle: string;
  readonly message: string;
};

export type ResultatMoisEntreprise = {
  readonly entreprise: IdEntreprise;
  readonly mois: MoisJeu;
  readonly chiffreAffaires: Centimes;
  readonly margeBrute: Centimes;
  readonly resultatNet: Centimes;
  readonly tresorerieFin: Centimes;
  readonly explications: readonly Explication[];
};
