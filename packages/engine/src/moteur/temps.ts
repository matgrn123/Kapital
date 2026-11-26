import type { Parametres } from "@kapital/content";
import { moisJeu, type MoisJeu } from "../types/primitifs.js";

/**
 * L'horloge du jeu est l'horloge réelle, commune à tous (décision du 26 novembre 2026) :
 * 10 h 21 le jeudi 26 novembre 2026 dans la vie, c'est 10 h 21 le jeudi 26 novembre 2026
 * dans le jeu. Un mois de jeu est un mois calendaire réel, de 28 à 31 jours, lu à l'heure
 * de Paris (heure d'été comprise).
 *
 * Trois façons de repérer le temps, toutes des entiers :
 * - l'**heure du jeu** : millisecondes depuis le 1er janvier 1970 0 h (UTC) sur l'horloge
 *   du jeu. Instant réel = `worlds.debut_reel` + heure du jeu ; en production `debut_reel`
 *   vaut le 1er janvier 1970, les deux se confondent (l'outil d'admin « avancer le temps »
 *   recule `debut_reel`, donc avance l'heure du jeu) ;
 * - le **pas absolu** : nombre de pas écoulés depuis ce même instant (un pas = 1 minute
 *   réelle par défaut, paramètre `temps_minutes_reelles_par_pas`) ;
 * - le **mois** : index calendaire `année × 12 + (mois civil − 1)` (novembre 2026 = 24322).
 *   Le 12e mois d'un exercice (`(mois + 1) % 12 === 0`) est toujours décembre : l'exercice
 *   comptable est l'année civile.
 *
 * Fonctions pures : aucun `Date`, aucun `Intl`, aucune lecture de l'horloge de la machine.
 * Le calendrier est calculé en arithmétique entière (algorithme « days from civil »), et
 * l'heure d'été suit la règle européenne (dernier dimanche de mars et d'octobre, à 1 h UTC),
 * appliquée à toutes les années (simplification : avant 1996 les règles différaient).
 */
export type ConfigTemps = {
  readonly minutesReellesParPas: number;
  /**
   * @deprecated Ancien ratio « 1 jour réel = 1 mois de jeu ». Un mois de jeu est désormais
   * un mois calendaire réel : utiliser `pasDansLeMois`, `debutDuMoisMs`, `finDuMoisMs`.
   * Conservé le temps que les délais, l'interface et le banc d'essai passent aux heures
   * réelles (lots T2, T6, T7), supprimé au lot T8.
   */
  readonly minutesReellesParMoisJeu: number;
};

const MS_PAR_MINUTE = 60_000;
const MINUTES_PAR_HEURE = 60;
const MS_PAR_HEURE = 3_600_000;
const MS_PAR_JOUR = 86_400_000;
const MOIS_PAR_AN = 12;

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
  // Une heure doit contenir un nombre entier de pas : les débuts de mois (minuit à Paris,
  // décalé d'une ou deux heures entières sur UTC) tombent alors toujours sur un début de pas.
  if (!Number.isInteger(minutesReellesParPas) || MINUTES_PAR_HEURE % minutesReellesParPas !== 0) {
    throw new Error(
      `Une heure doit contenir un nombre entier de pas : temps_minutes_reelles_par_pas doit diviser 60, reçu ${minutesReellesParPas}.`,
    );
  }
  const minutesReellesParMoisJeu = lirePositif(params, "temps_minutes_reelles_par_mois_jeu");
  return { minutesReellesParPas, minutesReellesParMoisJeu };
}

// ---------------------------------------------------------------------------
// Calendrier (arithmétique entière, sans Date)
// ---------------------------------------------------------------------------

function verifierEntier(nom: string, valeur: number): void {
  if (!Number.isInteger(valeur)) throw new Error(`${nom} doit être un entier, reçu ${valeur}.`);
}

/** Jours depuis le 1er janvier 1970 d'une date civile (calendrier grégorien). */
function joursDepuisCivil(annee: number, mois: number, jour: number): number {
  const a = mois <= 2 ? annee - 1 : annee;
  const ere = Math.floor(a / 400);
  const anDeLEre = a - ere * 400;
  const jourDeLAn = Math.floor((153 * (mois + (mois > 2 ? -3 : 9)) + 2) / 5) + jour - 1;
  const jourDeLEre =
    anDeLEre * 365 + Math.floor(anDeLEre / 4) - Math.floor(anDeLEre / 100) + jourDeLAn;
  return ere * 146_097 + jourDeLEre - 719_468;
}

/** Date civile d'un nombre de jours depuis le 1er janvier 1970. */
function civilDepuisJours(jours: number): { annee: number; mois: number; jour: number } {
  const z = jours + 719_468;
  const ere = Math.floor(z / 146_097);
  const jourDeLEre = z - ere * 146_097;
  const anDeLEre = Math.floor(
    (jourDeLEre -
      Math.floor(jourDeLEre / 1460) +
      Math.floor(jourDeLEre / 36_524) -
      Math.floor(jourDeLEre / 146_096)) /
      365,
  );
  const jourDeLAn = jourDeLEre - (365 * anDeLEre + Math.floor(anDeLEre / 4) - Math.floor(anDeLEre / 100));
  const mp = Math.floor((5 * jourDeLAn + 2) / 153);
  const jour = jourDeLAn - Math.floor((153 * mp + 2) / 5) + 1;
  const mois = mp < 10 ? mp + 3 : mp - 9;
  return { annee: anDeLEre + ere * 400 + (mois <= 2 ? 1 : 0), mois, jour };
}

/** Jour de la semaine d'un nombre de jours depuis le 1er janvier 1970 (0 = dimanche). */
function jourSemaineDimanche0(jours: number): number {
  return (((jours + 4) % 7) + 7) % 7; // le 1er janvier 1970 était un jeudi
}

function joursDuMoisCivil(annee: number, mois: number): number {
  return mois === 12
    ? joursDepuisCivil(annee + 1, 1, 1) - joursDepuisCivil(annee, 12, 1)
    : joursDepuisCivil(annee, mois + 1, 1) - joursDepuisCivil(annee, mois, 1);
}

/** Instant UTC (ms) du dernier dimanche du mois civil, à 1 h UTC (changement d'heure européen). */
function changementDHeureMs(annee: number, mois: number): number {
  const dernierJour = joursDepuisCivil(annee, mois, joursDuMoisCivil(annee, mois));
  const dimanche = dernierJour - jourSemaineDimanche0(dernierJour);
  return dimanche * MS_PAR_JOUR + MS_PAR_HEURE;
}

/** Décalage de l'heure de Paris sur UTC à un instant : 2 h en heure d'été, 1 h sinon. */
export function decalageParisHeures(instantMs: number): 1 | 2 {
  if (!Number.isFinite(instantMs)) throw new Error(`Instant invalide : ${instantMs}.`);
  const { annee } = civilDepuisJours(Math.floor(instantMs / MS_PAR_JOUR));
  const ete = instantMs >= changementDHeureMs(annee, 3) && instantMs < changementDHeureMs(annee, 10);
  return ete ? 2 : 1;
}

/** Date et heure de Paris d'un instant (ms depuis le 1er janvier 1970 UTC). */
export type DateLocaleParis = {
  readonly annee: number;
  /** Mois civil, de 1 (janvier) à 12 (décembre). */
  readonly mois: number;
  readonly jour: number;
  readonly heure: number;
  readonly minute: number;
  /** Jour de la semaine, de 1 (lundi) à 7 (dimanche). */
  readonly jourSemaine: number;
  /** 2 en heure d'été, 1 en heure d'hiver. */
  readonly decalageHeures: 1 | 2;
};

/**
 * Heure de Paris d'un instant, sans `Intl` : règle du dernier dimanche de mars et d'octobre.
 * Sert à l'affichage et au marché (courbe des ventes selon l'heure du jour).
 */
export function heureLocaleParis(instantMs: number): DateLocaleParis {
  const decalageHeures = decalageParisHeures(instantMs);
  const local = instantMs + decalageHeures * MS_PAR_HEURE;
  const jours = Math.floor(local / MS_PAR_JOUR);
  const minutesDuJour = Math.floor((local - jours * MS_PAR_JOUR) / MS_PAR_MINUTE);
  const { annee, mois, jour } = civilDepuisJours(jours);
  const dimanche0 = jourSemaineDimanche0(jours);
  return {
    annee,
    mois,
    jour,
    heure: Math.floor(minutesDuJour / MINUTES_PAR_HEURE),
    minute: minutesDuJour % MINUTES_PAR_HEURE,
    jourSemaine: dimanche0 === 0 ? 7 : dimanche0,
    decalageHeures,
  };
}

/** Index du mois de jeu d'un mois civil (`mois` de 1 à 12) : `année × 12 + (mois − 1)`. */
export function indexDuMois(annee: number, mois: number): MoisJeu {
  verifierEntier("annee", annee);
  if (!Number.isInteger(mois) || mois < 1 || mois > MOIS_PAR_AN) {
    throw new Error(`Mois civil invalide : ${mois} (de 1 à 12).`);
  }
  return moisJeu(annee * MOIS_PAR_AN + mois - 1);
}

/** Année et mois civil (de 1 à 12) d'un index de mois de jeu. */
export function moisCalendaire(m: number): { readonly annee: number; readonly mois: number } {
  verifierEntier("mois", m);
  return { annee: Math.floor(m / MOIS_PAR_AN), mois: (((m % MOIS_PAR_AN) + MOIS_PAR_AN) % MOIS_PAR_AN) + 1 };
}

/** Premier mois sur le calendrier réel : janvier 1970 (avant la migration 0043, mois_courant comptait depuis 0). */
export const PREMIER_MOIS_CALENDAIRE: MoisJeu = indexDuMois(1970, 1);

/** Vrai si un index de mois est sur le calendrier réel (janvier 1970 ou après). */
export function estMoisCalendaire(m: number): boolean {
  return Number.isInteger(m) && m >= PREMIER_MOIS_CALENDAIRE;
}

/**
 * Début du mois `m` (le 1er à minuit, heure de Paris), en heure du jeu (ms).
 * Le 1er à minuit n'est jamais un jour de changement d'heure : 2 h de décalage d'avril
 * à octobre, 1 h sinon.
 */
export function debutDuMoisMs(m: number): number {
  const { annee, mois } = moisCalendaire(m);
  const decalage = mois >= 4 && mois <= 10 ? 2 : 1;
  return joursDepuisCivil(annee, mois, 1) * MS_PAR_JOUR - decalage * MS_PAR_HEURE;
}

/** Fin du mois `m` (= début du mois suivant) : moment des salaires, loyers, prêts et de la TVA. */
export function finDuMoisMs(m: number): number {
  return debutDuMoisMs(m + 1);
}

/** Nombre de jours civils du mois `m` (28 à 31). */
export function joursDansLeMois(m: number): number {
  const { annee, mois } = moisCalendaire(m);
  return joursDuMoisCivil(annee, mois);
}

/** Mois de jeu qui contient un instant (heure du jeu, ms). */
export function moisDeLInstantMs(heureJeuMs: number): MoisJeu {
  if (!Number.isFinite(heureJeuMs)) throw new Error(`Instant invalide : ${heureJeuMs}.`);
  const local = heureLocaleParis(Math.floor(heureJeuMs));
  let m = local.annee * MOIS_PAR_AN + local.mois - 1;
  // Garde-fou : on recale sur les bornes exactes du mois.
  while (debutDuMoisMs(m) > heureJeuMs) m -= 1;
  while (finDuMoisMs(m) <= heureJeuMs) m += 1;
  return moisJeu(m);
}

function msParPas(config: ConfigTemps): number {
  return config.minutesReellesParPas * MS_PAR_MINUTE;
}

/** Pas absolu où commence le mois `m` (entier : un mois commence toujours sur un pas). */
function premierPasDuMois(config: ConfigTemps, m: number): number {
  return debutDuMoisMs(m) / msParPas(config);
}

/**
 * Nombre de pas du mois `m` : sa vraie durée (28 à 31 jours, une heure de moins en mars,
 * une de plus en octobre) divisée par la durée d'un pas. 44 640 pas pour un mois de 31 jours
 * au rythme réel d'une minute par pas.
 */
export function pasDansLeMois(config: ConfigTemps, m: number): number {
  return (finDuMoisMs(m) - debutDuMoisMs(m)) / msParPas(config);
}

// ---------------------------------------------------------------------------
// Position d'un pas dans son mois
// ---------------------------------------------------------------------------

export type PositionPas = {
  readonly mois: MoisJeu;
  /** Rang du pas dans le mois, de 0 à pasDansLeMois − 1. */
  readonly indexDansMois: number;
  /** Nombre de pas de ce mois. */
  readonly pasDansLeMois: number;
  /** Vrai pour le dernier pas du mois : c'est lui qui déclenche les échéances. */
  readonly estDernierPasDuMois: boolean;
};

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

/** Mois de jeu et rang dans le mois d'un pas absolu (compté depuis le 1er janvier 1970). */
export function positionDuPasAbsolu(config: ConfigTemps, pasAbsolu: number): PositionPas {
  verifierEntierPositif("pasAbsolu", pasAbsolu);
  const mois = moisDeLInstantMs(pasAbsolu * msParPas(config));
  const indexDansMois = pasAbsolu - premierPasDuMois(config, mois);
  const nb = pasDansLeMois(config, mois);
  return { mois, indexDansMois, pasDansLeMois: nb, estDernierPasDuMois: indexDansMois === nb - 1 };
}

/** Pas absolu à partir d'un mois et d'un rang dans ce mois. */
export function pasAbsoluDepuisPosition(
  config: ConfigTemps,
  mois: number,
  indexDansMois: number,
): number {
  verifierEntierPositif("mois", mois);
  verifierEntierPositif("indexDansMois", indexDansMois);
  const nb = pasDansLeMois(config, mois);
  if (indexDansMois >= nb) {
    throw new Error(`Rang de pas hors du mois : ${indexDansMois} (le mois ${mois} compte ${nb} pas).`);
  }
  return premierPasDuMois(config, mois) + indexDansMois;
}

// ---------------------------------------------------------------------------
// Horloge commune : le temps de jeu se lit sur le calendrier du serveur
// ---------------------------------------------------------------------------
//
// Le pas k occupe l'intervalle réel [debut + k × durée d'un pas, debut + (k + 1) × durée
// d'un pas[, où debut = worlds.debut_reel. Un pas est « terminé » quand son intervalle est
// entièrement écoulé : c'est alors que le moteur le traite. L'instant courant est un
// paramètre fourni par le serveur (jamais par le navigateur), pas un appel à l'horloge.

/** Nombre de pas entièrement écoulés depuis l'origine de l'horloge (jamais négatif). */
export function pasTerminesDepuis(
  config: ConfigTemps,
  debutReelMs: number,
  maintenantMs: number,
): number {
  verifierInstant("debutReelMs", debutReelMs);
  verifierInstant("maintenantMs", maintenantMs);
  const ecoule = maintenantMs - debutReelMs;
  if (ecoule <= 0) return 0;
  return Math.floor(ecoule / msParPas(config));
}

/** Instant réel (ms) où commence le pas `pasAbsolu`. */
export function debutDuPasEnMs(
  config: ConfigTemps,
  debutReelMs: number,
  pasAbsolu: number,
): number {
  verifierInstant("debutReelMs", debutReelMs);
  verifierEntierPositif("pasAbsolu", pasAbsolu);
  return debutReelMs + pasAbsolu * msParPas(config);
}

/**
 * Pas dans lequel tombe un événement daté (livraison, échéance...). Un événement
 * antérieur à l'origine de l'horloge est traité au pas 0.
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
  /** Heure du jeu (ms depuis le 1er janvier 1970 UTC) : `heureLocaleParis` la rend lisible. */
  readonly heureJeuMs: number;
  /** Mois de jeu en cours (index calendaire). */
  readonly moisEnCours: MoisJeu;
  /** Rang du pas en cours dans le mois de jeu en cours. */
  readonly indexDansMois: number;
  /** Nombre de pas du mois en cours (il varie avec la longueur du mois). */
  readonly pasParMois: number;
  readonly debutPasEnCoursMs: number;
  readonly finPasEnCoursMs: number;
  /** Fin du mois de jeu en cours (instant réel) : moment des salaires, loyers, prêts et de la TVA. */
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
  return {
    pasTermines,
    heureJeuMs: Math.max(0, maintenantMs - debutReelMs),
    moisEnCours: position.mois,
    indexDansMois: position.indexDansMois,
    pasParMois: position.pasDansLeMois,
    debutPasEnCoursMs: debutDuPasEnMs(config, debutReelMs, pasTermines),
    finPasEnCoursMs: debutDuPasEnMs(config, debutReelMs, pasTermines + 1),
    finDuMoisMs: debutReelMs + finDuMoisMs(position.mois),
  };
}
