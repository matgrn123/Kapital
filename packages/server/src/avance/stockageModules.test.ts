import { chargerModulesV1 } from "@kapital/content";
import { effetsPlan } from "@kapital/engine";
import { describe, expect, it } from "vitest";
import { materielDepuisLedger, modulesDepuisLignes } from "./stockageSupabase.js";

const CATALOGUE = chargerModulesV1();

describe("3D-3 : chargerEtat lit les modules posés et le matériel au bilan", () => {
  it("les lignes placed_modules deviennent des modules du moteur, avec leur effet", () => {
    const modules = modulesDepuisLignes(
      [
        { module_type_id: "poste_couture_base", x: 2, y: 1, pivote: false },
        { module_type_id: "poste_couture_base", x: 5, y: 1, pivote: null },
        { module_type_id: "table_coupe_simple", x: 2, y: 4, pivote: true },
      ],
      CATALOGUE,
    );
    expect(modules).toHaveLength(3);
    expect(modules[1]!.pivote).toBe(false);
    expect(effetsPlan(modules)).toMatchObject({ postesEquipes: 2, tableCoupe: true });
  });

  it("3D-5 : seul le plan actif est chargé, le plan prévu attend la clôture", () => {
    const modules = modulesDepuisLignes(
      [
        { module_type_id: "poste_couture_base", x: 2, y: 1, pivote: false, statut: "actif" },
        { module_type_id: "poste_couture_base", x: 2, y: 1, pivote: false, statut: "prevu" },
        { module_type_id: "poste_couture_base", x: 5, y: 1, pivote: false, statut: "prevu" },
        { module_type_id: "poste_couture_base", x: 8, y: 1, pivote: false },
      ],
      CATALOGUE,
    );
    expect(modules.map((m) => m.x)).toEqual([2, 8]);
  });

  it("sans atelier ni module : aucun poste", () => {
    expect(modulesDepuisLignes(null, CATALOGUE)).toEqual([]);
  });

  it("soldes 2154 (brut) et 2815 (amortissements cumulés)", () => {
    expect(
      materielDepuisLedger([
        { compte: "2154", sens: "debit", montant_centimes: 130_000 },
        { compte: "2815", sens: "credit", montant_centimes: 2_167 },
        { compte: "2815", sens: "credit", montant_centimes: 2_167 },
      ]),
    ).toEqual({ valeurBrute: 130_000, amortissementsCumules: 4_334 });
  });
});
