import { describe, expect, it } from "vitest";
import { chargerModulesV1, chargerParametresV1 } from "@kapital/content";
import { apercuPlacement, chargeMensuelle, empriseModule, meublesDuModule, resumeProduction, type ModulePlace } from "./plan";

const catalogue = chargerModulesV1();
const parametres = chargerParametresV1();
const atelier = { largeur: 10, hauteur: 5, entree_x: 0, entree_y: 3 };
const poste = catalogue.find((m) => m.effet.type === "poste_artisan")!;
const stock = catalogue.find((m) => m.effet.type === "stockage")!;

describe("plan de l'atelier (cases comptées à partir de 1)", () => {
  it("l'emprise d'un module en x = 1 commence sur la première case", () => {
    const e = empriseModule({ module_type_id: poste.id, x: 1, y: 1, pivote: false }, catalogue)!;
    expect(e).toEqual({ x: 1, y: 1, w: poste.largeur_grille, d: poste.hauteur_grille });
  });

  it("accepte un module dans une zone libre et refuse un chevauchement ou un débord", () => {
    const plan: ModulePlace[] = [{ module_type_id: poste.id, x: 3, y: 1, pivote: false }];
    expect(apercuPlacement(atelier, plan, { module_type_id: poste.id, x: 6, y: 1, pivote: false }, catalogue).valide).toBe(true);
    expect(apercuPlacement(atelier, plan, { module_type_id: poste.id, x: 3, y: 1, pivote: false }, catalogue).valide).toBe(false);
    expect(apercuPlacement(atelier, plan, { module_type_id: poste.id, x: 10, y: 1, pivote: false }, catalogue).valide).toBe(false);
  });

  it("compte les postes, les artisans au poste et le stockage à partir des modules", () => {
    const plan: ModulePlace[] = [
      { module_type_id: poste.id, x: 1, y: 1, pivote: false },
      { module_type_id: stock.id, x: 5, y: 1, pivote: false },
    ];
    const salaries = [
      { id: "a", poste: "artisan" as const, experienceMois: 0 },
      { id: "b", poste: "artisan" as const, experienceMois: 3 },
    ];
    const r = resumeProduction(plan, salaries, catalogue, parametres);
    expect(r.postes).toBe(1);
    expect(r.auPoste.map((s) => s.id)).toEqual(["b"]);
    expect(r.artisansSansPoste).toBe(1);
    expect(r.postesSansArtisan).toBe(0);
    expect(r.stockageM3).toBe(stock.effet.type === "stockage" ? stock.effet.capacite_m3 : 0);
    expect(r.capaciteMinutes).toBeGreaterThan(0);
    expect(r.capaciteMaxMinutes).toBeGreaterThanOrEqual(r.capaciteMinutes);
  });

  it("sans poste, la capacité est nulle", () => {
    const r = resumeProduction([], [{ id: "a", poste: "artisan", experienceMois: 0 }], catalogue, parametres);
    expect(r.capaciteMinutes).toBe(0);
    expect(r.artisansSansPoste).toBe(1);
  });

  it("la charge par mois est le prix réparti sur la durée d'amortissement du catalogue", () => {
    expect(chargeMensuelle(poste)).toBe(Math.round(poste.prix_centimes / poste.amortissement_mois));
  });

  it("chaque type d'effet a au moins un meuble dessiné dans son emprise", () => {
    for (const m of catalogue) {
      const meubles = meublesDuModule(m.effet.type, { x: 1, y: 1, w: m.largeur_grille, d: m.hauteur_grille });
      expect(meubles.length).toBeGreaterThan(0);
      for (const mb of meubles) {
        expect(mb.x).toBeGreaterThanOrEqual(0);
        expect(mb.y).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
