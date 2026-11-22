import {
  centimes,
  minutes,
  type Centimes,
  type Minutes,
} from "../types/primitifs.js";

export function rendement(
  moisExperience: number,
  rMin: number,
  rMax: number,
  tau: number,
): number {
  if (moisExperience < 0) {
    throw new Error("moisExperience doit être >= 0");
  }
  if (tau <= 0) {
    throw new Error("tau doit être > 0");
  }
  return rMin + (rMax - rMin) * (1 - Math.exp(-moisExperience / tau));
}

export function capaciteMinutes(
  nombreArtisans: number,
  nombrePostesEquipes: number,
  heuresMensuelles: number,
  rendementEffectif: number,
): Minutes {
  if (nombreArtisans < 0) {
    throw new Error("nombre d'artisans doit être >= 0");
  }
  if (nombrePostesEquipes < 0) {
    throw new Error("nombre de postes équipés doit être >= 0");
  }
  // Un artisan sans poste équipé ne produit pas (formule du plan d'aménagement 3D)
  const actifs = Math.min(nombreArtisans, nombrePostesEquipes);
  const brut = actifs * heuresMensuelles * 60 * rendementEffectif;
  return minutes(Math.floor(brut));
}

export type EntreesCoutMinute = {
  readonly chargesTotales: Centimes;
  readonly minutesProduites: Minutes;
};

export function coutMinute(e: EntreesCoutMinute): Centimes {
  if (e.minutesProduites <= 0) {
    throw new Error("minutes produites doit être > 0 pour calculer le coût minute");
  }
  return centimes(Math.round(e.chargesTotales / e.minutesProduites));
}

export type EntreesCoutRevient = {
  readonly prixMatiereParUnite: Centimes;
  readonly consommationParPiece: number;
  readonly tauxChute: number;
  readonly fournitures: Centimes;
  readonly tempsMinutes: Minutes;
  readonly coutMinute: Centimes;
};

export function coutRevient(e: EntreesCoutRevient): Centimes {
  const matiere = e.prixMatiereParUnite * e.consommationParPiece * (1 + e.tauxChute);
  const facon = e.tempsMinutes * e.coutMinute;
  return centimes(Math.round(matiere + e.fournitures + facon));
}
