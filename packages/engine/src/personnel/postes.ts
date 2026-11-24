import type { Salarie } from "../types/entreprise.js";

// AE-7 : un artisan ne produit que s'il occupe un poste équipé (une machine). Les artisans
// en trop sont payés mais ne produisent pas et ne comptent pas dans le rendement.

/** Postes de travail encore libres : machines moins artisans (jamais négatif). */
export function postesLibres(salaries: readonly Salarie[], nombrePostes: number): number {
  const artisans = salaries.filter((s) => s.poste === "artisan").length;
  return Math.max(0, nombrePostes - artisans);
}

/**
 * Les artisans qui occupent un poste : les plus expérimentés d'abord, dans la limite du nombre
 * de postes. À expérience égale, l'ordre d'embauche est conservé.
 */
export function artisansAuPoste(salaries: readonly Salarie[], nombrePostes: number): readonly Salarie[] {
  return salaries
    .filter((s) => s.poste === "artisan")
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.experienceMois - a.s.experienceMois || a.i - b.i)
    .slice(0, Math.max(0, nombrePostes))
    .map((x) => x.s);
}
