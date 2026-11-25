// 3D-3 : ce que le plan d'aménagement change à l'économie de l'atelier.
//
// Le moteur ne lit plus un « nombre de machines » abstrait : il lit les modules réellement
// posés dans l'atelier (table placed_modules) et en tire
//   - les postes équipés (effets poste_artisan et poste_artisan_specialise du catalogue) :
//     capacité = min(artisans, postes équipés), sans poste pas de production ;
//   - la capacité de stockage (effet stockage) et la présence d'une table de coupe ;
//   - l'amortissement linéaire du matériel acheté (prix / amortissement_mois du catalogue).
// Les caractéristiques de chaque module (effet, prix, durée) viennent de
// packages/content/modules-v1.json : resoudreModules les recopie à partir du catalogue.

import type { EffetModule, TypeModule } from "@kapital/content";
import { centimes, type Centimes } from "../types/primitifs.js";
import type { PositionModule } from "./valider-plan.js";

/**
 * Le module posé d'office à la signature d'un bail ou à l'achat d'un local (décision du
 * 25 novembre 2026). Il fait partie du local : il n'est ni payé, ni inscrit à l'actif, ni amorti.
 * Le nombre posé vient du paramètre bail_machines_a_la_signature.
 */
export const MODULE_POSE_A_LA_SIGNATURE = "poste_couture_base";

/** Un module posé dans l'atelier, avec ce que le catalogue en dit. x, y comptés à partir de 1. */
export type ModulePose = {
  readonly idType: string;
  readonly x: number;
  readonly y: number;
  readonly pivote: boolean;
  readonly effet: EffetModule;
  /** Prix d'achat du catalogue, en centimes. */
  readonly prix: Centimes;
  readonly amortissementMois: number;
};

/**
 * Matériel inscrit au bilan (soldes du grand livre) : 2154 brut et 2815 cumulé.
 * Sert de plafond à l'amortissement : on n'amortit jamais plus que ce qui a été acheté.
 */
export type MaterielAtelier = {
  readonly valeurBrute: Centimes;
  readonly amortissementsCumules: Centimes;
};

export type EffetsPlan = {
  /** Postes où un artisan peut travailler (machine posée). */
  readonly postesEquipes: number;
  readonly stockageM3: number;
  readonly tableCoupe: boolean;
};

export function estPoste(effet: Pick<EffetModule, "type">): boolean {
  return effet.type === "poste_artisan" || effet.type === "poste_artisan_specialise";
}

export function effetsPlan(modules: readonly { readonly effet: EffetModule }[]): EffetsPlan {
  let postesEquipes = 0;
  let stockageM3 = 0;
  let tableCoupe = false;
  for (const m of modules) {
    if (estPoste(m.effet)) postesEquipes += 1;
    if (m.effet.type === "stockage") stockageM3 += m.effet.capacite_m3;
    if (m.effet.type === "table_coupe") tableCoupe = true;
  }
  return { postesEquipes, stockageM3, tableCoupe };
}

/** Postes équipés d'un atelier (0 sans atelier ou sans module posé). */
export function postesEquipesAtelier(atelier: { readonly modules: readonly ModulePose[] } | null): number {
  return atelier === null ? 0 : effetsPlan(atelier.modules).postesEquipes;
}

/**
 * Complète un plan (positions) avec les données du catalogue. Un module absent du catalogue
 * n'a aucun effet : il est ignoré.
 */
export function resoudreModules(
  plan: readonly PositionModule[],
  catalogue: readonly TypeModule[],
): ModulePose[] {
  const parId = new Map(catalogue.map((t) => [t.id, t]));
  const sortie: ModulePose[] = [];
  for (const p of plan) {
    const t = parId.get(p.id_type);
    if (!t) continue;
    sortie.push({
      idType: t.id,
      x: p.x,
      y: p.y,
      pivote: p.pivote,
      effet: t.effet,
      prix: centimes(t.prix_centimes),
      amortissementMois: t.amortissement_mois,
    });
  }
  return sortie;
}

/**
 * Cases où la signature pose ses postes : rangée du haut, un poste toutes les 3 colonnes
 * (x = 2, 5, 8…, y = 1), une colonne libre entre deux postes. Même formule que la migration
 * 0036 (signer_bail, acheter_local, reprise des ateliers existants) ; un test vérifie que ces
 * positions passent validerPlanEtage sur la grille par défaut 10 × 5, entrée (0, 3).
 */
export function positionsPostesALaSignature(nombre: number): PositionModule[] {
  if (!Number.isInteger(nombre) || nombre < 0) {
    throw new Error(`nombre de postes à la signature invalide (${nombre})`);
  }
  return Array.from({ length: nombre }, (_, i) => ({
    id_type: MODULE_POSE_A_LA_SIGNATURE,
    x: 2 + 3 * i,
    y: 1,
    pivote: false,
  }));
}

/** Les postes posés à la signature, complétés par le catalogue. */
export function postesALaSignature(nombre: number, catalogue: readonly TypeModule[]): ModulePose[] {
  return resoudreModules(positionsPostesALaSignature(nombre), catalogue);
}

/** Modules achetés par le joueur : tous les modules posés, sauf les postes fournis avec le local. */
export function modulesAchetes(modules: readonly ModulePose[], postesFournis: number): ModulePose[] {
  let restant = Math.max(0, postesFournis);
  return modules.filter((m) => {
    if (restant > 0 && m.idType === MODULE_POSE_A_LA_SIGNATURE) {
      restant -= 1;
      return false;
    }
    return true;
  });
}

/**
 * Dotation mensuelle aux amortissements du matériel (681 / 2815) : amortissement linéaire,
 * prix / amortissement_mois de chaque module acheté, arrondi au centime une fois la somme faite.
 * Plafond : le matériel restant à amortir (2154 brut − 2815 cumulé). Sans soldes connus, la
 * valeur brute est le prix des modules achetés et rien n'est encore amorti.
 */
export function amortissementMensuelModules(
  modules: readonly ModulePose[],
  postesFournis: number,
  materiel?: MaterielAtelier,
): Centimes {
  const achetes = modulesAchetes(modules, postesFournis);
  let dotation = 0;
  for (const m of achetes) {
    if (!(m.amortissementMois > 0)) {
      throw new Error(`durée d'amortissement invalide pour ${m.idType} (${m.amortissementMois})`);
    }
    dotation += m.prix / m.amortissementMois;
  }
  const valeurBrute = materiel?.valeurBrute ?? achetes.reduce((s, m) => s + m.prix, 0);
  const dejaAmorti = materiel?.amortissementsCumules ?? 0;
  const restant = Math.max(0, valeurBrute - dejaAmorti);
  return centimes(Math.min(Math.round(dotation), restant));
}
