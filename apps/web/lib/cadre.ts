// Dates du jeu, pour la barre du haut et tous les écrans. Aucune règle de jeu ici.
//
// L'horloge du jeu EST l'horloge réelle, à l'heure de Paris : 10 h 21 le jeudi
// 26 novembre 2026 dans la vie = 10 h 21 le jeudi 26 novembre 2026 dans le jeu.
// Un mois de jeu est un vrai mois (28 à 31 jours).
//
// Index de mois (worlds.mois_courant, mois_jeu des écritures…) :
//   index = année × 12 + (mois civil − 1)   (novembre 2026 = 24322).
// La conversion est écrite ici, en petit, pour l'affichage. Quand le moteur
// exposera la sienne (lot T1, packages/engine/src/moteur/temps.ts), on pourra
// la remplacer par celle du moteur.
//
// Transition : tant que la base contient encore l'ancien compteur (mois 0, 1, 2…),
// un index inférieur à INDEX_CALENDAIRE_MIN s'affiche « mois N », comme avant.

/** Plus petit index lu comme un vrai mois (janvier de l'an 100) ; en dessous, c'est l'ancien compteur. */
export const INDEX_CALENDAIRE_MIN = 1200;

const MS_MINUTE = 60_000;
const MS_HEURE = 60 * MS_MINUTE;
const MS_JOUR = 24 * MS_HEURE;

/** Le jeu se joue à l'heure de Paris, même quand la page est rendue sur un serveur en UTC. */
const FUSEAU = "Europe/Paris";

export const NOMS_MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
] as const;

export const NOMS_MOIS_COURTS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
] as const;

const JOURS_SEMAINE = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."] as const;

/* ------------------------------------------------------------ Index de mois */

export function estIndexCalendaire(mois: number): boolean {
  return Number.isInteger(mois) && mois >= INDEX_CALENDAIRE_MIN;
}

export function indexDeMois(annee: number, mois: number): number {
  return annee * 12 + (mois - 1);
}

/** Année et mois civil (1 à 12) d'un index ; null pour l'ancien compteur. */
export function moisCivil(index: number): { annee: number; mois: number } | null {
  if (!estIndexCalendaire(index)) return null;
  return { annee: Math.floor(index / 12), mois: (index % 12) + 1 };
}

/** « novembre 2026 » ; « mois 10 » pour l'ancien compteur. */
export function libelleMois(index: number): string {
  const c = moisCivil(index);
  return c ? `${NOMS_MOIS[c.mois - 1]} ${c.annee}` : `mois ${index}`;
}

/** « Novembre 2026 » ; « Mois 10 » pour l'ancien compteur (titres de carte). */
export function titreMois(index: number): string {
  return majuscule(libelleMois(index));
}

/** Première lettre en majuscule (début de phrase). */
export function majuscule(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** « nov. 2026 » ; « mois 10 » pour l'ancien compteur. */
export function libelleMoisCourt(index: number): string {
  const c = moisCivil(index);
  return c ? `${NOMS_MOIS_COURTS[c.mois - 1]} ${c.annee}` : `mois ${index}`;
}

/** « en novembre 2026 » ; « au mois 10 » pour l'ancien compteur. */
export function enMois(index: number): string {
  return estIndexCalendaire(index) ? `en ${libelleMois(index)}` : `au ${libelleMois(index)}`;
}

/** « janvier à décembre 2026 », « novembre 2026 à décembre 2027 » ; null pour l'ancien compteur. */
export function periodeMois(debut: number, fin: number): string | null {
  const a = moisCivil(debut);
  const b = moisCivil(fin);
  if (!a || !b) return null;
  if (a.annee === b.annee) return `${NOMS_MOIS[a.mois - 1]} à ${libelleMois(fin)}`;
  return `${libelleMois(debut)} à ${libelleMois(fin)}`;
}

/* ------------------------------------------------------- Longueur des mois */

export function joursDansLeMois(annee: number, mois: number): number {
  if (mois === 2) {
    const bissextile = (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
    return bissextile ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(mois) ? 30 : 31;
}

/**
 * Instant réel (ms) du 1er du mois à minuit, heure de Paris. Le décalage avec UTC
 * vaut 2 h d'avril à octobre et 1 h sinon : le 1er à minuit ne tombe jamais un jour
 * de changement d'heure (dernier dimanche de mars et d'octobre).
 */
export function debutDuMoisMs(index: number): number {
  const annee = Math.floor(index / 12);
  const mois = (index % 12) + 1;
  const decalageHeures = mois >= 4 && mois <= 10 ? 2 : 1;
  return Date.UTC(annee, mois - 1, 1) - decalageHeures * MS_HEURE;
}

/** Instant réel de la clôture du mois : le 1er du mois suivant à minuit, heure de Paris. */
export function finDuMoisMs(index: number): number {
  return debutDuMoisMs(index + 1);
}

/* --------------------------------------------------------- Instants réels */

export type PartiesParis = {
  readonly annee: number;
  readonly mois: number;
  readonly jour: number;
  readonly heure: number;
  readonly minute: number;
  /** « jeu. » */
  readonly jourSemaine: string;
};

let formateurParis: Intl.DateTimeFormat | null = null;

/** Date et heure d'un instant à Paris. */
export function partiesParis(instantMs: number): PartiesParis {
  formateurParis ??= new Intl.DateTimeFormat("fr-FR", {
    timeZone: FUSEAU,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  const p: Record<string, number> = {};
  for (const part of formateurParis.formatToParts(new Date(instantMs))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const annee = p.year!;
  const mois = p.month!;
  const jour = p.day!;
  const jourSemaine = JOURS_SEMAINE[new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay()]!;
  return { annee, mois, jour, heure: p.hour! % 24, minute: p.minute!, jourSemaine };
}

function enMs(instant: string | number | null | undefined): number {
  if (instant === null || instant === undefined) return Number.NaN;
  return typeof instant === "number" ? instant : Date.parse(instant);
}

/** Index du mois (heure de Paris) où tombe un instant. */
export function indexDuMoisDe(instantMs: number): number {
  const p = partiesParis(instantMs);
  return indexDeMois(p.annee, p.mois);
}

/** Mois (index) et jour du mois d'un instant, à Paris. */
export function positionDeLInstant(instantMs: number): { mois: number; jour: number } {
  const p = partiesParis(instantMs);
  return { mois: indexDeMois(p.annee, p.mois), jour: p.jour };
}

function jourLisible(jour: number): string {
  return jour === 1 ? "1er" : String(jour);
}

function heureDe(p: PartiesParis): string {
  return `${p.heure} h ${String(p.minute).padStart(2, "0")}`;
}

function dateDe(p: PartiesParis, avecAnnee = true): string {
  const date = `${p.jourSemaine} ${jourLisible(p.jour)} ${NOMS_MOIS_COURTS[p.mois - 1]}`;
  return avecAnnee ? `${date} ${p.annee}` : date;
}

const INCONNUE = "date inconnue";

/** « jeu. 26 nov. 2026, 10 h 21 ». */
export function dateHeureLisible(instant: string | number): string {
  const ms = enMs(instant);
  if (!Number.isFinite(ms)) return INCONNUE;
  const p = partiesParis(ms);
  return `${dateDe(p)}, ${heureDe(p)}`;
}

/** « jeu. 26 nov. 2026 ». */
export function dateLisible(instant: string | number): string {
  const ms = enMs(instant);
  if (!Number.isFinite(ms)) return INCONNUE;
  return dateDe(partiesParis(ms));
}

/** « 10 h 21 ». */
export function heureLisible(instant: string | number): string {
  const ms = enMs(instant);
  if (!Number.isFinite(ms)) return INCONNUE;
  return heureDe(partiesParis(ms));
}

/** « jeu. 10 h 21 » : le jour de la semaine et l'heure, pour un instant des dernières 24 heures. */
export function jourEtHeureLisible(instant: string | number): string {
  const ms = enMs(instant);
  if (!Number.isFinite(ms)) return INCONNUE;
  const p = partiesParis(ms);
  return `${p.jourSemaine} ${heureDe(p)}`;
}

/** Délai réel lisible : « dans 48 min », « il y a 3 h 05 », « dans 2 jours ». */
export function delaiReel(ecartMs: number): string {
  const minutes = Math.floor(Math.abs(ecartMs) / MS_MINUTE);
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

/** « jeu. 26 nov. 2026, 12 h 21 (dans 2 h) ». */
export function dateEtDelai(instant: string | number, maintenantMs: number): string {
  const ms = enMs(instant);
  if (!Number.isFinite(ms)) return INCONNUE;
  return `${dateHeureLisible(ms)} (${delaiReel(ms - maintenantMs)})`;
}

/**
 * Livraison ou fin de travaux : « vers 12 h 21 (dans 2 h) » si c'est aujourd'hui,
 * « vers ven. 27 nov., 8 h 00 (dans 21 h 39) » sinon (avec l'année si elle change).
 */
export function versQuand(instant: string | number, maintenantMs: number): string {
  const ms = enMs(instant);
  if (!Number.isFinite(ms)) return INCONNUE;
  const p = partiesParis(ms);
  const auj = partiesParis(maintenantMs);
  const memeJour = p.annee === auj.annee && p.mois === auj.mois && p.jour === auj.jour;
  const quand = memeJour ? heureDe(p) : `${dateDe(p, p.annee !== auj.annee)}, ${heureDe(p)}`;
  return `vers ${quand} (${delaiReel(ms - maintenantMs)})`;
}

/**
 * Fin d'un mois (salaires, loyers, échéances) : « lun. 30 nov. 2026 (dans 4 jours) ».
 * Pour l'ancien compteur : « fin du mois 10 ».
 */
export function finDuMoisLisible(index: number, maintenantMs: number): string {
  if (!estIndexCalendaire(index)) return `fin du ${libelleMois(index)}`;
  const fin = finDuMoisMs(index);
  return `${dateLisible(fin - 1)} (${delaiReel(fin - maintenantMs)})`;
}

/* ------------------------------------------------------- Barre du haut */

/** Avant cette date, worlds.debut_reel est l'origine de l'horloge réelle (1er janvier 1970). */
const LIMITE_ORIGINE_REELLE_MS = Date.UTC(2000, 0, 1);

/**
 * Instant du jeu. En production il vaut l'instant réel (worlds.debut_reel = 1er janvier
 * 1970) ; en recette, l'outil « avancer le temps » recule debut_reel, et le jeu est en
 * avance d'autant. Avec l'ancien départ du monde (une date récente), on montre l'instant réel.
 */
export function instantDuJeu(maintenantMs: number, debutReel: string | number | null | undefined): number {
  const debut = enMs(debutReel);
  if (!Number.isFinite(debut) || debut >= LIMITE_ORIGINE_REELLE_MS) return maintenantMs;
  return maintenantMs - debut;
}

/** Ancien compteur : un mois de jeu affiché en 30 jours. */
const JOURS_ANCIEN_COMPTEUR = 30;

/** Jour du mois en cours (1 à 31) : le vrai jour à Paris, ou l'ancien découpage en 30 jours. */
export function jourEcoule(
  horloge: { moisEnCours: number; indexDansMois: number; pasParMois: number },
  instantJeuMs: number,
): number {
  if (estIndexCalendaire(horloge.moisEnCours)) return partiesParis(instantJeuMs).jour;
  if (!(horloge.pasParMois > 0)) return 1;
  const jour = Math.floor((horloge.indexDansMois / horloge.pasParMois) * JOURS_ANCIEN_COMPTEUR) + 1;
  return Math.min(JOURS_ANCIEN_COMPTEUR, Math.max(1, jour));
}

/**
 * Jours sur lesquels répartir les ventes du mois en cours (« Ventes / jour ») : le temps écoulé
 * depuis le début du mois, ou depuis la création de la société si elle est plus récente, jamais
 * moins d'un jour (une société créée il y a une heure n'a pas vendu « par jour » sur une heure).
 * `creationJeuMs` : instant du jeu où la société a été créée ; null si inconnu.
 */
export function joursDeVente(
  horloge: { moisEnCours: number; indexDansMois: number; pasParMois: number },
  instantJeuMs: number,
  creationJeuMs: number | null,
): number {
  if (!estIndexCalendaire(horloge.moisEnCours)) return jourEcoule(horloge, instantJeuMs);
  let debut = debutDuMoisMs(horloge.moisEnCours);
  if (creationJeuMs !== null && Number.isFinite(creationJeuMs) && creationJeuMs > debut) debut = creationJeuMs;
  const jours = (instantJeuMs - debut) / MS_JOUR;
  return Number.isFinite(jours) ? Math.max(1, jours) : 1;
}

/** Chiffre d'affaires HT moyen par jour écoulé du mois, en centimes entiers. */
export function ventesParJour(caMoisHt: number, jourDuMois: number): number {
  if (caMoisHt <= 0) return 0;
  return Math.round(caMoisHt / Math.max(1, jourDuMois));
}
