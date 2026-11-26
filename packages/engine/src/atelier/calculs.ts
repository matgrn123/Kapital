import {
  centimes,
  minutes,
  type Centimes,
  type Minutes,
} from "../types/primitifs.js";
import type { Salarie } from "../types/entreprise.js";
import { debutDuMoisMs, moisDeLInstantMs } from "../moteur/temps.js";

/**
 * Rendement d'un artisan selon son expérience : de rMin (débutant) vers rMax, courbe
 * d'apprentissage de constante `tau`. Expérience et tau dans la même unité (des jours depuis
 * l'horloge réelle : `rendement_tau_jours`).
 */
export function rendement(
  experience: number,
  rMin: number,
  rMax: number,
  tau: number,
): number {
  if (experience < 0) {
    throw new Error("l'expérience doit être >= 0");
  }
  if (tau <= 0) {
    throw new Error("tau doit être > 0");
  }
  return rMin + (rMax - rMin) * (1 - Math.exp(-experience / tau));
}

const MS_PAR_JOUR = 86_400_000;

/**
 * Expérience d'un salarié en jours à un instant (heure du jeu, ms), comptée depuis son embauche
 * (décision de Mathieu du 26/11/2026). Sans date d'embauche, il est réputé embauché au début du
 * mois, `experienceMois` mois complets avant le mois de l'instant. Jamais négative.
 */
export function experienceEnJours(salarie: Salarie, instantMs: number): number {
  const embauche =
    salarie.embaucheMs ?? debutDuMoisMs(moisDeLInstantMs(instantMs) - Math.max(0, salarie.experienceMois));
  return Math.max(0, instantMs - embauche) / MS_PAR_JOUR;
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
