import { describe, expect, it } from "vitest";
import {
  validerPlanEtage,
  type DimensionsModule,
  type PlanEtage,
  type PositionModule,
} from "./valider-plan.js";

// --- helpers ----------------------------------------------------------------

/** Catalogue minimal pour les tests : modules 1×1, 1×2, 2×2 */
const CAT: DimensionsModule[] = [
  { id: "s1x1", largeur_grille: 1, hauteur_grille: 1 },
  { id: "s1x2", largeur_grille: 1, hauteur_grille: 2 },
  { id: "s2x2", largeur_grille: 2, hauteur_grille: 2 },
  { id: "s3x1", largeur_grille: 3, hauteur_grille: 1 },
];

function grille(
  largeur: number,
  hauteur: number,
  modules: PositionModule[],
  entree_x = 0,
  entree_y = 1,
): PlanEtage {
  return { largeur, hauteur, entree_x, entree_y, modules };
}

function pm(id_type: string, x: number, y: number, pivote = false): PositionModule {
  return { id_type, x, y, pivote };
}

// --- entrée -----------------------------------------------------------------

describe("entrée", () => {
  it("refuse une entrée en dehors de la grille étendue", () => {
    const plan = grille(4, 4, [], -1, -1);
    const r = validerPlanEtage(plan, CAT);
    expect(r.valide).toBe(false);
    expect(r.erreurs.some((e) => e.type === "entree_hors_grille")).toBe(true);
  });

  it("accepte une entrée sur le bord gauche (x = 0)", () => {
    const plan = grille(4, 4, [], 0, 2);
    expect(validerPlanEtage(plan, CAT).valide).toBe(true);
  });
});

// --- type inconnu -----------------------------------------------------------

describe("type inconnu", () => {
  it("signale un id_type absent du catalogue", () => {
    const plan = grille(4, 4, [pm("fantome", 1, 1)]);
    const r = validerPlanEtage(plan, CAT);
    expect(r.valide).toBe(false);
    expect(r.erreurs.some((e) => e.type === "type_inconnu")).toBe(true);
  });
});

// --- collision --------------------------------------------------------------

describe("collision (critère d'acceptation 3D-2)", () => {
  it("accepte deux modules côte à côte sans chevauchement", () => {
    const plan = grille(6, 4, [pm("s1x1", 1, 1), pm("s1x1", 2, 1)]);
    expect(validerPlanEtage(plan, CAT).valide).toBe(true);
  });

  it("détecte deux modules qui se chevauchent exactement", () => {
    const plan = grille(4, 4, [pm("s1x1", 2, 2), pm("s1x1", 2, 2)]);
    const r = validerPlanEtage(plan, CAT);
    expect(r.valide).toBe(false);
    expect(r.erreurs.some((e) => e.type === "collision")).toBe(true);
  });

  it("détecte un chevauchement partiel (2×2 contre 2×2 décalé de 1)", () => {
    const plan = grille(6, 6, [pm("s2x2", 1, 1), pm("s2x2", 2, 1)]);
    const r = validerPlanEtage(plan, CAT);
    expect(r.valide).toBe(false);
    expect(r.erreurs.some((e) => e.type === "collision")).toBe(true);
  });

  it("accepte deux modules 2×2 séparés d'une colonne", () => {
    const plan = grille(8, 4, [pm("s2x2", 1, 1), pm("s2x2", 4, 1)]);
    expect(validerPlanEtage(plan, CAT).valide).toBe(true);
  });

  it("détecte le chevauchement d'un module pivoté", () => {
    // s1x2 pivoté devient 2×1 ; placé en (2,1), occupe (2,1) et (3,1)
    // s3x1 en (1,1) occupe (1,1),(2,1),(3,1) → collision sur (2,1) et (3,1)
    const plan = grille(6, 4, [pm("s1x2", 2, 1, true), pm("s3x1", 1, 1)]);
    const r = validerPlanEtage(plan, CAT);
    expect(r.valide).toBe(false);
    expect(r.erreurs.some((e) => e.type === "collision")).toBe(true);
  });
});

// --- hors grille ------------------------------------------------------------

describe("hors grille (critère d'acceptation 3D-2)", () => {
  it("refuse un module dont x < 1", () => {
    const plan = grille(4, 4, [pm("s1x1", 0, 1)]);
    const r = validerPlanEtage(plan, CAT);
    expect(r.valide).toBe(false);
    expect(r.erreurs.some((e) => e.type === "hors_grille")).toBe(true);
  });

  it("refuse un module qui déborde à droite", () => {
    const plan = grille(4, 4, [pm("s2x2", 4, 1)]);
    const r = validerPlanEtage(plan, CAT);
    expect(r.erreurs.some((e) => e.type === "hors_grille")).toBe(true);
  });

  it("refuse un module qui déborde en bas", () => {
    const plan = grille(4, 4, [pm("s1x2", 1, 4)]);
    const r = validerPlanEtage(plan, CAT);
    expect(r.erreurs.some((e) => e.type === "hors_grille")).toBe(true);
  });

  it("accepte un module exactement dans le coin bas-droit", () => {
    // 2×2 en (3,3) sur une grille 4×4 : occupe (3,3),(4,3),(3,4),(4,4) → OK
    const plan = grille(4, 4, [pm("s2x2", 3, 3)], 0, 1);
    expect(validerPlanEtage(plan, CAT).valide).toBe(true);
  });
});

// --- passage bloqué ---------------------------------------------------------

describe("passage bloqué (critère d'acceptation 3D-2)", () => {
  it("accepte un seul module accessible depuis l'entrée", () => {
    // grille 4×4, entrée à gauche (0,2), module en (2,2)
    const plan = grille(4, 4, [pm("s1x1", 2, 2)], 0, 2);
    expect(validerPlanEtage(plan, CAT).valide).toBe(true);
  });

  it("détecte un module entouré et inaccessible", () => {
    // grille 5×5, entrée (0,3)
    // module cible en (3,3) : entouré par des 1×1 en (2,2),(3,2),(4,2),(2,3),(4,3),(2,4),(3,4),(4,4)
    const plan = grille(5, 5, [
      pm("s1x1", 2, 2),
      pm("s1x1", 3, 2),
      pm("s1x1", 4, 2),
      pm("s1x1", 2, 3),
      pm("s1x1", 3, 3), // ← cible piégée
      pm("s1x1", 4, 3),
      pm("s1x1", 2, 4),
      pm("s1x1", 3, 4),
      pm("s1x1", 4, 4),
    ], 0, 3);
    const r = validerPlanEtage(plan, CAT);
    expect(r.valide).toBe(false);
    const bloquees = r.erreurs.filter((e) => e.type === "passage_bloque");
    // Le module central (3,3) est bloqué ; les modules de la muraille sont accessibles
    expect(bloquees.length).toBeGreaterThanOrEqual(1);
  });

  it("accepte un couloir étroit avec un module au fond", () => {
    // grille 5×3, entrée (0,2)
    // couloir : ligne 2 libre de x=1 à x=4, module en (5,2)... non, grille trop petite
    // grille 6×3, entrée (0,2), module en (5,2), murs de chaque côté (s1x1 en ligne 1 et 3)
    const plan = grille(6, 3, [
      pm("s1x1", 1, 1), pm("s1x1", 2, 1), pm("s1x1", 3, 1),
      pm("s1x1", 4, 1), pm("s1x1", 5, 1),
      pm("s1x1", 1, 3), pm("s1x1", 2, 3), pm("s1x1", 3, 3),
      pm("s1x1", 4, 3), pm("s1x1", 5, 3),
      pm("s1x1", 6, 2), // module au fond du couloir
    ], 0, 2);
    expect(validerPlanEtage(plan, CAT).valide).toBe(true);
  });
});

// --- plan complet valide ----------------------------------------------------

describe("plan complet", () => {
  it("valide un plan réaliste d'atelier (2 postes + table + stockage)", () => {
    // grille 8×6, entrée (0,3)
    // 2 postes de couture 2×2 : (1,1) et (4,1)
    // table de coupe 1×2 (pivotée → 2×1) : (1,4)
    // stockage 1×2 : (7,2)
    const plan = grille(8, 6, [
      pm("s2x2", 1, 1),
      pm("s2x2", 4, 1),
      pm("s1x2", 1, 4, true), // pivoté : occupe (1,4) et (2,4)
      pm("s1x2", 7, 2),       // vertical : occupe (7,2) et (7,3)
    ], 0, 3);
    expect(validerPlanEtage(plan, CAT).valide).toBe(true);
  });
});
