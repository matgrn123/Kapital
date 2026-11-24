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

// ---------------------------------------------------------------------------
// Horloge commune : le temps de jeu se lit sur le calendrier du serveur
// ---------------------------------------------------------------------------
//
// Le monde naît à un instant réel (`debutReelMs`). Le pas k occupe l'intervalle
// réel [debut + k × durée d'un pas, debut + (k + 1) × durée d'un pas[. Un pas est
// « terminé » quand son intervalle est entièrement écoulé : c'est alors que le
// moteur le traite. Rien ne « tourne » en permanence : tout se déduit de
// l'instant fourni par le serveur (jamais par le navigateur).
//
// Ces fonctions sont pures : l'instant courant est un paramètre, pas un appel
// à l'horloge de la machine.

const MS_PAR_MINUTE = 60_000;

function verifierInstant(nom: string, valeur: number): void {
  if (!Number.isFinite(valeur)) {
    throw new Error(`${nom} doit être un nombre fini (millisecondes), reçu ${valeur}.`);
  }
}

function verifierEntierPositif(nom: string, valeur: number): void {
  if (!Number.isInteger(valeur) || valeur < 0) {
    throw new Error(`${nom} doit être un entier >= 0, reçu ${valeur}.`);
  }
}

/** Nombre de pas entièrement écoulés depuis la création du monde (jamais négatif). */
export function pasTerminesDepuis(
  config: ConfigTemps,
  debutReelMs: number,
  maintenantMs: number,
): number {
  verifierInstant("debutReelMs", debutReelMs);
  verifierInstant("maintenantMs", maintenantMs);
  const ecoule = maintenantMs - debutReelMs;
  if (ecoule <= 0) return 0;
  return Math.floor(ecoule / (config.minutesReellesParPas * MS_PAR_MINUTE));
}

/** Mois de jeu et rang dans le mois d'un pas, numéroté depuis la création du monde. */
export function positionDuPasAbsolu(config: ConfigTemps, pasAbsolu: number): PositionPas {
  verifierEntierPositif("pasAbsolu", pasAbsolu);
  const indexDansMois = pasAbsolu % config.pasParMois;
  return {
    mois: moisJeu(Math.floor(pasAbsolu / config.pasParMois)),
    indexDansMois,
    estDernierPasDuMois: indexDansMois === config.pasParMois - 1,
  };
}

/** Numéro d'un pas depuis la création du monde, à partir de son mois et de son rang. */
export function pasAbsoluDepuisPosition(
  config: ConfigTemps,
  mois: number,
  indexDansMois: number,
): number {
  verifierEntierPositif("mois", mois);
  verifierEntierPositif("indexDansMois", indexDansMois);
  if (indexDansMois >= config.pasParMois) {
    throw new Error(
      `Rang de pas hors du mois : ${indexDansMois} (un mois compte ${config.pasParMois} pas).`,
    );
  }
  return mois * config.pasParMois + indexDansMois;
}

/** Instant réel (ms) où commence le pas `pasAbsolu`. */
export function debutDuPasEnMs(
  config: ConfigTemps,
  debutReelMs: number,
  pasAbsolu: number,
): number {
  verifierInstant("debutReelMs", debutReelMs);
  verifierEntierPositif("pasAbsolu", pasAbsolu);
  return debutReelMs + pasAbsolu * config.minutesReellesParPas * MS_PAR_MINUTE;
}

/**
 * Pas dans lequel tombe un événement daté (livraison, échéance...). Un événement
 * antérieur à la création du monde est traité au pas 0.
 */
export function pasAbsoluDepuisInstantReel(
  config: ConfigTemps,
  debutReelMs: number,
  instantMs: number,
): number {
  verifierInstant("debutReelMs", debutReelMs);
  verifierInstant("instantMs", instantMs);
  return pasTerminesDepuis(config, debutReelMs, instantMs);
}

/** Ce que tous les joueurs voient à un instant donné. */
export type Horloge = {
  /** Pas entièrement écoulés : ceux que le moteur doit avoir traités. */
  readonly pasTermines: number;
  /** Mois de jeu en cours. */
  readonly moisEnCours: MoisJeu;
  /** Rang du pas en cours dans le mois de jeu en cours. */
  readonly indexDansMois: number;
  readonly pasParMois: number;
  readonly debutPasEnCoursMs: number;
  readonly finPasEnCoursMs: number;
  /** Fin du mois de jeu en cours : moment des salaires, loyers, prêts et de la TVA. */
  readonly finDuMoisMs: number;
};

export function horlogeDepuis(
  config: ConfigTemps,
  debutReelMs: number,
  maintenantMs: number,
): Horloge {
  const pasTermines = pasTerminesDepuis(config, debutReelMs, maintenantMs);
  // Le pas en cours est le prochain à terminer : il porte le numéro `pasTermines`.
  const position = positionDuPasAbsolu(config, pasTermines);
  const debutPasEnCoursMs = debutDuPasEnMs(config, debutReelMs, pasTermines);
  const finPasEnCoursMs = debutDuPasEnMs(config, debutReelMs, pasTermines + 1);
  const finDuMoisMs = debutDuPasEnMs(
    config,
    debutReelMs,
    (position.mois + 1) * config.pasParMois,
  );
  return {
    pasTermines,
    moisEnCours: position.mois,
    indexDansMois: position.indexDansMois,
    pasParMois: config.pasParMois,
    debutPasEnCoursMs,
    finPasEnCoursMs,
    finDuMoisMs,
  };
}
