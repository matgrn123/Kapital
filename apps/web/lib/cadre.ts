// Dates de jeu, pour la barre du haut et tous les écrans. Aucune règle de jeu ici :
// la date est une lecture de l'horloge commune (packages/engine/src/moteur/temps.ts)
// et du calendrier de jeu (moteur/calendrier.ts), les ventes une division pour l'affichage.

import { chargerParametresV1, type Parametres } from "@kapital/content";
import {
  calendrierDuMois,
  configCalendrierDepuis,
  configTempsDepuis,
  horlogeDepuis,
  type CollectionDuMois,
  type ConfigCalendrier,
  type ConfigTemps,
  type Saison,
} from "@kapital/engine";
import { formaterDateHeure } from "./formatage";

export type CadreCalendrier = {
  readonly temps: ConfigTemps;
  readonly calendrier: ConfigCalendrier;
  /** Jours de jeu affichés dans un mois (temps_jours_par_mois_jeu). */
  readonly joursParMois: number;
};

export function cadreDepuisParametres(params: Parametres): CadreCalendrier {
  const jours = params["temps_jours_par_mois_jeu"]?.valeur;
  if (!jours || !Number.isInteger(jours) || jours <= 0) {
    throw new Error("Paramètre temps_jours_par_mois_jeu manquant ou invalide.");
  }
  return { temps: configTempsDepuis(params), calendrier: configCalendrierDepuis(params), joursParMois: jours };
}

let cadreParDefaut: CadreCalendrier | null = null;
/** Cadre lu dans parametres-v1.json (chargé une fois). */
export function cadreV1(): CadreCalendrier {
  cadreParDefaut ??= cadreDepuisParametres(chargerParametresV1());
  return cadreParDefaut;
}

export const NOMS_MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
] as const;

export const NOMS_SAISONS: Record<Saison, string> = {
  hiver: "Hiver",
  printemps: "Printemps",
  ete: "Été",
  automne: "Automne",
};

export function nomCollection(c: Pick<CollectionDuMois, "type" | "anneeDebut">): string {
  return `${c.type === "PE" ? "printemps-été" : "automne-hiver"}, an ${c.anneeDebut}`;
}

function moisValide(mois: number): boolean {
  return Number.isInteger(mois) && mois >= 0;
}

/** « mars, an 1 » pour un mois de jeu (compté depuis 0). */
export function libelleMoisDeJeu(mois: number, cadre: CadreCalendrier = cadreV1()): string {
  if (!moisValide(mois)) return `mois ${mois}`;
  const c = calendrierDuMois(mois, cadre.calendrier);
  return `${NOMS_MOIS[c.moisCalendaire - 1]}, an ${c.annee}`;
}

/** Jour du mois de jeu (1 à joursParMois) d'après la position dans le mois. */
function jourDuMois(indexDansMois: number, pasParMois: number, joursParMois: number): number {
  const jour = Math.floor((indexDansMois / pasParMois) * joursParMois) + 1;
  return Math.min(joursParMois, Math.max(1, jour));
}

function jourLisible(jour: number): string {
  return jour === 1 ? "1er" : String(jour);
}

/** « 12 mars, an 1 ». */
export function dateDeJeu(
  mois: number,
  indexDansMois: number,
  pasParMois: number,
  cadre: CadreCalendrier = cadreV1(),
): string {
  if (!moisValide(mois)) return `mois ${mois}`;
  if (!(pasParMois > 0)) return libelleMoisDeJeu(mois, cadre);
  return `${jourLisible(jourDuMois(indexDansMois, pasParMois, cadre.joursParMois))} ${libelleMoisDeJeu(mois, cadre)}`;
}

/** Délai réel lisible : « dans 48 min », « il y a 3 h 05 », « dans 2 jours ». */
export function delaiReel(ecartMs: number): string {
  const minutes = Math.floor(Math.abs(ecartMs) / 60_000);
  if (minutes < 1) return "à l'instant";
  let texte: string;
  if (minutes < 60) {
    texte = `${minutes} min`;
  } else if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    texte = m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
  } else {
    const j = Math.floor(minutes / (24 * 60));
    texte = `${j} jour${j > 1 ? "s" : ""}`;
  }
  return ecartMs >= 0 ? `dans ${texte}` : `il y a ${texte}`;
}

function enMs(instant: string | number | null | undefined): number {
  if (instant === null || instant === undefined) return Number.NaN;
  return typeof instant === "number" ? instant : Date.parse(instant);
}

/** Mois et jour de jeu d'un instant réel. Avant la naissance du monde : 1er jour du mois 0. */
export function positionDeJeuDepuisInstant(
  instantMs: number,
  debutMondeMs: number,
  cadre: CadreCalendrier = cadreV1(),
): { mois: number; jour: number } {
  const h = horlogeDepuis(cadre.temps, debutMondeMs, Math.max(instantMs, debutMondeMs));
  return { mois: h.moisEnCours, jour: jourDuMois(h.indexDansMois, h.pasParMois, cadre.joursParMois) };
}

/**
 * Date de jeu d'un instant réel (livraison, écriture, embauche…), avec le délai réel
 * entre parenthèses : « 12 mars, an 1 (dans 48 min) ». Si la naissance du monde est
 * inconnue, on affiche la date réelle plutôt que rien.
 */
export function dateDeJeuDepuisInstant(
  instant: string | number,
  debutMonde: string | number | null | undefined,
  maintenantMs: number,
  cadre: CadreCalendrier = cadreV1(),
): string {
  const instantMs = enMs(instant);
  if (!Number.isFinite(instantMs)) return "date inconnue";
  const debutMs = enMs(debutMonde);
  if (!Number.isFinite(debutMs)) return formaterDateHeure(new Date(instantMs).toISOString());
  const { mois, jour } = positionDeJeuDepuisInstant(instantMs, debutMs, cadre);
  return `${jourLisible(jour)} ${libelleMoisDeJeu(mois, cadre)} (${delaiReel(instantMs - maintenantMs)})`;
}

/** Instant réel (ms) de la clôture d'un mois de jeu : la fin de son dernier pas. */
export function instantFinDuMois(mois: number, debutMondeMs: number, cadre: CadreCalendrier = cadreV1()): number {
  return debutMondeMs + (mois + 1) * cadre.temps.minutesReellesParMoisJeu * 60_000;
}

/**
 * Fin d'un mois de jeu (échéances, salaires, loyers) : « 30 mai, an 1 (dans 1 h 30) ».
 * Sans naissance du monde connue : « fin mai, an 1 ».
 */
export function finDuMoisDeJeu(
  mois: number,
  debutMonde: string | number | null | undefined,
  maintenantMs: number,
  cadre: CadreCalendrier = cadreV1(),
): string {
  if (!moisValide(mois)) return `mois ${mois}`;
  const debutMs = enMs(debutMonde);
  if (!Number.isFinite(debutMs)) return `fin ${libelleMoisDeJeu(mois, cadre)}`;
  const ecart = instantFinDuMois(mois, debutMs, cadre) - maintenantMs;
  return `${cadre.joursParMois} ${libelleMoisDeJeu(mois, cadre)} (${delaiReel(ecart)})`;
}

/** Chiffre d'affaires HT moyen par jour de jeu écoulé, en centimes entiers. */
export function ventesParJour(
  caMoisHt: number,
  indexDansMois: number,
  pasParMois: number,
  cadre: CadreCalendrier = cadreV1(),
): number {
  if (!(pasParMois > 0) || caMoisHt <= 0) return 0;
  return Math.round(caMoisHt / jourDuMois(indexDansMois, pasParMois, cadre.joursParMois));
}
