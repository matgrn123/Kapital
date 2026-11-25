// Saisie directe à côté d'un curseur : le joueur tape « 29,90 » au lieu de chercher
// le bon cran. Affichage seulement : la valeur lue est ramenée dans les bornes du
// curseur, et le serveur revérifie tout. Montants en centimes.

import { lireEuros } from "./apercu-lot4";
import { formaterEuros } from "./formatage";

/** « euros » : la valeur du curseur est en centimes ; « nombre » : un entier (pièces, mètres). */
export type ModeSaisie = "euros" | "nombre";

/** Entier positif ou nul saisi (espaces de milliers permis), ou null. */
function lireEntier(saisie: string): number | null {
  const propre = saisie.replace(/\s/g, "");
  if (!/^\d+$/.test(propre)) return null;
  const n = Number(propre);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Valeur tapée par le joueur, ramenée dans [min, max] ; `ramenee` dit si elle a dû l'être.
 * Null si la saisie est illisible (texte, centimes en trop, décimales pour un nombre).
 */
export function lireSaisie(
  texte: string,
  mode: ModeSaisie,
  bornes: { min: number; max: number },
): { valeur: number; ramenee: boolean } | null {
  const lu = mode === "euros" ? lireEuros(texte) : lireEntier(texte);
  if (lu === null) return null;
  const valeur = Math.min(Math.max(lu, bornes.min), bornes.max);
  return { valeur, ramenee: valeur !== lu };
}

/** Texte de la case de saisie pour une valeur du curseur. */
export function texteSaisie(valeur: number, mode: ModeSaisie): string {
  return mode === "euros" ? formaterEuros(valeur) : valeur.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}
