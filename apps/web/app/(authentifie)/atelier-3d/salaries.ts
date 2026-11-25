// Salariés dans l'atelier (ticket 3D-6) : où dessiner chacun, et ce que dit sa fiche.
// Aucun chiffre en dur : qui est au poste vient du moteur (artisansAuPoste, via resumeProduction),
// le coût employeur et le rendement des fonctions du moteur, avec les paramètres de content.
// Coordonnées : emprises à partir de 1 (comme plan.ts), positions de dessin à partir de 0.

import type { Parametres } from "@kapital/content";
import { centimes, coefficientsSalairesDepuisParametres, coutEmployeur, rendement } from "@kapital/engine";
import type { DimensionsAtelier, Emprise, SalarieAtelier } from "./plan";

/** Salarié tel que lu en base, avec ce qu'affiche sa fiche. */
export type SalarieFiche = SalarieAtelier & {
  /** Date d'embauche, déjà écrite en date de jeu (« 12 mars, an 1 (il y a 2 jours) »). */
  depuis: string;
  ancienneteMois: number;
  salaireBrutCentimes: number;
};

/** Poste de travail placé dans l'atelier : son emprise et le nom du module. */
export type PosteAtelier = { emprise: Emprise; nom: string };

export type SalariePlace = {
  id: string;
  /** Position du personnage, en coordonnées de dessin (à partir de 0). */
  x: number;
  y: number;
  /** Poste occupé, ou null : l'artisan attend dans l'allée (ou l'encadrement n'a pas de machine). */
  poste: PosteAtelier | null;
};

const dans = (e: Emprise, x: number, y: number) => x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.d;

/** Postes dans un ordre stable : du fond vers l'avant (y), puis de gauche à droite (x). */
export function trierPostes(postes: readonly PosteAtelier[]): PosteAtelier[] {
  return [...postes].sort((a, b) => a.emprise.y - b.emprise.y || a.emprise.x - b.emprise.x);
}

/**
 * Cases libres (à partir de 1) de l'atelier, de la plus proche à la plus éloignée de l'entrée :
 * c'est « l'allée » où attendent les salariés sans poste.
 */
export function casesAllee(atelier: DimensionsAtelier, occupees: readonly Emprise[]): { x: number; y: number }[] {
  const libres: { x: number; y: number; dist: number }[] = [];
  for (let y = 1; y <= atelier.hauteur; y++)
    for (let x = 1; x <= atelier.largeur; x++)
      if (!occupees.some((e) => dans(e, x, y)))
        libres.push({ x, y, dist: Math.abs(x - atelier.entree_x) + Math.abs(y - atelier.entree_y) });
  return libres.sort((a, b) => a.dist - b.dist || a.y - b.y || a.x - b.x).map(({ x, y }) => ({ x, y }));
}

/**
 * Place chaque salarié recruté. Ceux que le moteur met au poste (`auPoste`, dans l'ordre
 * d'embauche) prennent les postes dans l'ordre stable de trierPostes ; les autres sont
 * dessinés dans l'allée, près de l'entrée. Chaque salarié apparaît une fois, et une seule.
 */
export function placerSalaries(a: {
  salaries: readonly SalarieAtelier[];
  auPoste: readonly SalarieAtelier[];
  postes: readonly PosteAtelier[];
  atelier: DimensionsAtelier;
  occupees: readonly Emprise[];
}): SalariePlace[] {
  const postes = trierPostes(a.postes);
  const ids = new Set(a.auPoste.map((s) => s.id));
  const auPoste = a.salaries.filter((s) => ids.has(s.id));
  const sortie: SalariePlace[] = [];
  const sansPoste: SalarieAtelier[] = [];
  auPoste.forEach((s, i) => {
    const p = postes[i];
    if (!p) return void sansPoste.push(s);
    const e = p.emprise;
    sortie.push({ id: s.id, x: e.x - 1 + e.w / 2, y: e.y - 1 + e.d - 0.2, poste: p });
  });
  sansPoste.push(...a.salaries.filter((s) => !ids.has(s.id)));
  const allee = casesAllee(a.atelier, a.occupees);
  sansPoste.forEach((s, i) => {
    // Plus de salariés que de cases libres : on les serre sur la dernière case plutôt que de les perdre.
    const c = allee[Math.min(i, allee.length - 1)] ?? { x: 1, y: 1 };
    const decalage = i >= allee.length ? (i - allee.length + 1) * 0.15 : 0;
    sortie.push({ id: s.id, x: c.x - 1 + 0.35 + decalage, y: c.y - 1 + 0.35, poste: null });
  });
  return sortie;
}

const lire = (p: Parametres, cle: string): number => {
  const v = p[cle];
  if (!v) throw new Error(`Paramètre manquant : ${cle}`);
  return v.valeur;
};

export type ChiffresFiche = {
  coutEmployeurCentimes: number;
  /** Rendement du moteur (ratio), et ses bornes : débutant et maximum. */
  rendement: number;
  rendementDebutant: number;
  rendementMax: number;
};

/** Chiffres de la fiche, calculés par le moteur (mêmes fonctions que la page Salariés et la production). */
export function chiffresFiche(s: SalarieFiche, parametres: Parametres): ChiffresFiche {
  const rMin = lire(parametres, "rendement_atelier_min");
  const rMax = lire(parametres, "rendement_atelier_max");
  const tau = lire(parametres, "rendement_tau_mois");
  return {
    coutEmployeurCentimes: coutEmployeur({
      ...coefficientsSalairesDepuisParametres(parametres),
      salaireBrutMensuel: centimes(s.salaireBrutCentimes),
    }),
    rendement: rendement(Math.max(0, s.experienceMois), rMin, rMax, tau),
    rendementDebutant: rMin,
    rendementMax: rMax,
  };
}
