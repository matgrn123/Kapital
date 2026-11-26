import { centimes, type Centimes, type MoisJeu } from "../types/primitifs.js";
import { debutDuMoisMs, finDuMoisMs, heureLocaleParis, joursDansLeMois } from "./temps.js";

/**
 * Lot T4 (horloge réelle) : prorata du premier mois.
 *
 * Une embauche ou un bail signé en cours de mois ne coûte, à la clôture de ce mois, que les
 * jours civils restants, jour de l'embauche (ou de la signature) compris, rapportés au nombre
 * de jours du mois (28 à 31) : c'est la méthode des « jours calendaires » de la paie française.
 * Exemple : embauche le 21 novembre → 10 jours sur 30, soit 10/30 du salaire.
 *
 * Le jour se lit à l'heure de Paris (heure du jeu). Fonctions pures, sans `Date` ni `Intl`.
 */
export type PartDuMois = {
  /** Jours dus, de 0 (engagement postérieur au mois) à `joursDuMois` (mois entier). */
  readonly jours: number;
  readonly joursDuMois: number;
};

/**
 * Part du mois `m` due pour un engagement qui commence à `debutMs` (heure du jeu, ms).
 * Avant le début du mois, ou date inconnue (banc d'essai, anciennes données) : mois entier.
 * À partir de la fin du mois (clôture rattrapée après coup) : aucun jour.
 */
export function partDuMoisDepuis(m: MoisJeu | number, debutMs: number | undefined): PartDuMois {
  const joursDuMois = joursDansLeMois(m);
  if (debutMs === undefined || !Number.isFinite(debutMs) || debutMs <= debutDuMoisMs(m)) {
    return { jours: joursDuMois, joursDuMois };
  }
  if (debutMs >= finDuMoisMs(m)) return { jours: 0, joursDuMois };
  const jour = heureLocaleParis(debutMs).jour;
  return { jours: joursDuMois - jour + 1, joursDuMois };
}

/** Vrai si la part couvre tout le mois. */
export function moisEntier(part: PartDuMois): boolean {
  return part.jours >= part.joursDuMois;
}

/**
 * Montant mensuel ramené à la part du mois, arrondi au centime une seule fois (sur le résultat).
 * Mois entier : le montant arrondi tel quel, sans multiplier ni diviser (aucun écart d'arrondi
 * par rapport à avant le prorata).
 */
export function auProrata(montantMensuel: number, part: PartDuMois): Centimes {
  if (moisEntier(part)) return centimes(Math.round(montantMensuel));
  if (part.jours <= 0) return centimes(0);
  return centimes(Math.round((montantMensuel * part.jours) / part.joursDuMois));
}
