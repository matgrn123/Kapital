import type { Centimes, MoisJeu } from "./primitifs.js";

export type MarketInputs = {
  readonly mois: MoisJeu;
  readonly smicHoraireBrut: Centimes;
  readonly tauxEstrAnnuel: number;
  readonly prixElectriciteParKwh: Centimes;
  readonly coursCotonParKg: Centimes;
  readonly inflationMensuelle: number;
};
