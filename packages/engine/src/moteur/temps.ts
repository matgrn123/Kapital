import type { Parametres } from "@kapital/content";
import { moisJeu, type InstantJeu, type MoisJeu } from "../types/primitifs.js";

/**
 * Découpage du temps : un mois de jeu est découpé en pas réguliers.
 * Les deux valeurs viennent de `parametres-v1.json` (jamais écrites en dur) :
 * - `temps_minutes_reelles_par_pas` : durée d'un pas, en minutes réelles ;
 * - `temps_minutes_reelles_par_mois_jeu` : durée d'un mois de jeu, en minutes
 *   réelles (1 jour réel = 1 mois de jeu donne 1440).
 */
export type ConfigTemps = {
  readonly minutesReellesParPas: number;
  readonly minutesReellesParMoisJeu: number;
  /** Nombre de pas dans un mois de jeu (entier). */
  readonly pasParMois: number;
};

function lirePositif(params: Parametres, cle: string): number {
  const p = params[cle];
  if (!p) throw new Error(`Paramètre manquant : ${cle}`);
  if (!Number.isFinite(p.valeur) || p.valeur <= 0) {
    throw new Error(`Paramètre ${cle} : la valeur doit être positive, reçu ${p.valeur}.`);
  }
  return p.valeur;
}

export function configTempsDepuis(params: Parametres): ConfigTemps {
  const minutesReellesParPas = lirePositif(params, "temps_minutes_reelles_par_pas");
  const minutesReellesParMoisJeu = lirePositif(params, "temps_minutes_reelles_par_mois_jeu");
  const pasParMois = minutesReellesParMoisJeu / minutesReellesParPas;
  if (!Number.isInteger(pasParMois)) {
    throw new Error(
      `Un mois de jeu (${minutesReellesParMoisJeu} min) doit contenir un nombre entier de pas de ${minutesReellesParPas} min (reçu ${pasParMois}).`,
    );
  }
  return { minutesReellesParPas, minutesReellesParMoisJeu, pasParMois };
}

export type PositionPas = {
  readonly mois: MoisJeu;
  /** Rang du pas dans le mois, de 0 à pasParMois - 1. */
  readonly indexDansMois: number;
  /** Vrai pour le dernier pas du mois : c'est lui qui déclenche les échéances. */
  readonly estDernierPasDuMois: boolean;
};

/** Pas auquel appartient un instant (minutes réelles depuis la création du monde). */
export function positionPasDepuisInstant(config: ConfigTemps, instant: InstantJeu): PositionPas {
  const mois = Math.floor(instant / config.minutesReellesParMoisJeu);
  const reste = instant - mois * config.minutesReellesParMoisJeu;
  const indexDansMois = Math.floor(reste / config.minutesReellesParPas);
  return {
    mois: moisJeu(mois),
    indexDansMois,
    estDernierPasDuMois: indexDansMois === config.pasParMois - 1,
  };
}
