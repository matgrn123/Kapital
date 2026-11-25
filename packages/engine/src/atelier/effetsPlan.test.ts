import { chargerBatimentsV1, chargerModulesV1, chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { centimes } from "../types/primitifs.js";
import {
  amortissementMensuelModules,
  effetsPlan,
  MODULE_POSE_A_LA_SIGNATURE,
  positionsPostesALaSignature,
  postesALaSignature,
  resoudreModules,
} from "./effetsPlan.js";
import { validerPlanEtage } from "./valider-plan.js";

const CATALOGUE = chargerModulesV1();
const PARAMS = chargerParametresV1();
const POSTES_SIGNATURE = PARAMS["bail_machines_a_la_signature"]!.valeur;
const type = (id: string) => CATALOGUE.find((t) => t.id === id)!;

describe("3D-3 : effets du plan d'aménagement", () => {
  it("compte les postes équipés (base et spécialisé), pas les autres modules", () => {
    const modules = resoudreModules(
      [
        { id_type: "poste_couture_base", x: 1, y: 1, pivote: false },
        { id_type: "poste_couture_surjeteuse", x: 4, y: 1, pivote: false },
        { id_type: "table_coupe_simple", x: 7, y: 1, pivote: false },
        { id_type: "zone_stockage_etageres", x: 1, y: 4, pivote: false },
        { id_type: "bureau_simple", x: 3, y: 4, pivote: false },
      ],
      CATALOGUE,
    );
    const e = effetsPlan(modules);
    expect(e.postesEquipes).toBe(2);
    expect(e.tableCoupe).toBe(true);
    const etagere = type("zone_stockage_etageres").effet;
    expect(e.stockageM3).toBe(etagere.type === "stockage" ? etagere.capacite_m3 : -1);
  });

  it("aucun module posé : aucun poste, pas de table de coupe", () => {
    expect(effetsPlan([])).toEqual({ postesEquipes: 0, stockageM3: 0, tableCoupe: false });
  });

  it("un module inconnu du catalogue n'a aucun effet", () => {
    expect(resoudreModules([{ id_type: "inconnu", x: 1, y: 1, pivote: false }], CATALOGUE)).toEqual([]);
  });

  it("retirer un poste fait baisser le nombre de postes", () => {
    const deux = postesALaSignature(2, CATALOGUE);
    expect(effetsPlan(deux).postesEquipes).toBe(2);
    expect(effetsPlan(deux.slice(1)).postesEquipes).toBe(1);
  });
});

describe("3D-3 : postes posés à la signature (migration 0036)", () => {
  it("le paramètre pose bien des postes de couture de base", () => {
    expect(POSTES_SIGNATURE).toBe(2);
    expect(positionsPostesALaSignature(2)).toEqual([
      { id_type: MODULE_POSE_A_LA_SIGNATURE, x: 2, y: 1, pivote: false },
      { id_type: MODULE_POSE_A_LA_SIGNATURE, x: 5, y: 1, pivote: false },
    ]);
  });

  it.each([0, 1, 2, 3])("%i poste(s) à ces cases : plan valide sur la grille par défaut 10 × 5", (n) => {
    const r = validerPlanEtage(
      { largeur: 10, hauteur: 5, entree_x: 0, entree_y: 3, modules: positionsPostesALaSignature(n) },
      [...CATALOGUE],
    );
    expect(r).toEqual({ valide: true, erreurs: [] });
  });

  it("les postes de la signature sont valides sur la grille de chaque atelier du catalogue", () => {
    for (const b of chargerBatimentsV1().filter((x) => x.categorie === "atelier")) {
      const g = b.grille;
      const r = validerPlanEtage(
        { largeur: g.largeur, hauteur: g.hauteur, entree_x: g.entree_x, entree_y: g.entree_y, modules: positionsPostesALaSignature(POSTES_SIGNATURE) },
        [...CATALOGUE],
      );
      expect(r.valide, b.id).toBe(true);
    }
  });
});

describe("3D-3 : amortissement des modules achetés", () => {
  it("amortissement mensuel = prix / durée du catalogue (linéaire)", () => {
    const table = resoudreModules([{ id_type: "table_coupe_simple", x: 1, y: 1, pivote: false }], CATALOGUE);
    const t = type("table_coupe_simple");
    expect(amortissementMensuelModules(table, 0)).toBe(Math.round(t.prix_centimes / t.amortissement_mois));
  });

  it("additionne plusieurs modules avant d'arrondir", () => {
    const modules = resoudreModules(
      [
        { id_type: "poste_couture_surjeteuse", x: 1, y: 1, pivote: false },
        { id_type: "zone_stockage_etageres", x: 4, y: 1, pivote: false },
      ],
      CATALOGUE,
    );
    const a = type("poste_couture_surjeteuse");
    const b = type("zone_stockage_etageres");
    expect(amortissementMensuelModules(modules, 0)).toBe(
      Math.round(a.prix_centimes / a.amortissement_mois + b.prix_centimes / b.amortissement_mois),
    );
  });

  it("les postes fournis avec le local ne sont pas amortis", () => {
    expect(amortissementMensuelModules(postesALaSignature(2, CATALOGUE), POSTES_SIGNATURE)).toBe(0);
    const trois = postesALaSignature(3, CATALOGUE);
    const p = type(MODULE_POSE_A_LA_SIGNATURE);
    expect(amortissementMensuelModules(trois, POSTES_SIGNATURE)).toBe(
      Math.round(p.prix_centimes / p.amortissement_mois),
    );
  });

  it("n'amortit jamais plus que le matériel restant au bilan (2154 − 2815)", () => {
    const table = resoudreModules([{ id_type: "table_coupe_simple", x: 1, y: 1, pivote: false }], CATALOGUE);
    const prix = type("table_coupe_simple").prix_centimes;
    expect(
      amortissementMensuelModules(table, 0, { valeurBrute: centimes(prix), amortissementsCumules: centimes(prix - 300) }),
    ).toBe(300);
    expect(
      amortissementMensuelModules(table, 0, { valeurBrute: centimes(prix), amortissementsCumules: centimes(prix) }),
    ).toBe(0);
    // Amortissements d'avant 3D-3 (forfait sans matériel au bilan) : plus rien à amortir.
    expect(
      amortissementMensuelModules(table, 0, { valeurBrute: centimes(0), amortissementsCumules: centimes(500_000) }),
    ).toBe(0);
  });
});
