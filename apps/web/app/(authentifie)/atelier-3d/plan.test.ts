import { describe, expect, it } from "vitest";
import { chargerModulesV1, chargerParametresV1 } from "@kapital/content";
import { iso } from "../../../components/iso/geometrie";
import { tailleMeuble } from "../../../components/iso/interieur";
import { apercuPlacement, chargeMensuelle, deplacerModule, empriseModule, meublesDuModule, pivoterModule, resumeProduction, type ModulePlace } from "./plan";

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

describe("3D-5 : pivoter et déplacer, validés par le moteur", () => {
  const table = catalogue.find((m) => m.effet.type === "table_coupe")!;

  it("le dessin d'un module pivoté reste dans son emprise pivotée (meubles pivotés eux aussi)", () => {
    for (const m of catalogue) {
      const e = empriseModule({ module_type_id: m.id, x: 2, y: 1, pivote: true }, catalogue)!;
      expect(e).toMatchObject({ w: m.hauteur_grille, d: m.largeur_grille });
      for (const mb of meublesDuModule(m.effet.type, e, true)) {
        const t = tailleMeuble(mb.meuble, mb.pivote);
        expect(mb.pivote).toBe(true);
        expect(mb.x).toBeGreaterThanOrEqual(e.x - 1 - 1e-9);
        expect(mb.y).toBeGreaterThanOrEqual(e.y - 1 - 1e-9);
        expect(mb.x + t.w).toBeLessThanOrEqual(e.x - 1 + e.w + 1e-9);
        expect(mb.y + t.d).toBeLessThanOrEqual(e.y - 1 + e.d + 1e-9);
      }
    }
  });

  it("un meuble pivoté est le miroir écran du meuble posé en (y, x) : la projection iso échange x et y", () => {
    const [ax, ay] = iso(3.2, 1.5, 0.7);
    const [bx, by] = iso(1.5, 3.2, 0.7);
    expect(ax).toBeCloseTo(-bx);
    expect(ay).toBeCloseTo(by);
  });

  it("pivoter : accepté si l'emprise pivotée tient, refusé sinon (le plan ne change pas)", () => {
    expect(table.hauteur_grille).toBeGreaterThan(table.largeur_grille);
    // Pivotée contre le bas de la grille : remise droite, elle dépasserait.
    const plan: ModulePlace[] = [{ module_type_id: table.id, x: 2, y: atelier.hauteur - table.largeur_grille + 1, pivote: true }];
    const r = pivoterModule(atelier, plan, 0, catalogue);
    expect(r.validation.valide).toBe(false);
    expect(r.plan).toEqual(plan);
    const droit: ModulePlace[] = [{ ...plan[0]!, pivote: false, y: 1 }];
    const ok = pivoterModule(atelier, droit, 0, catalogue);
    expect(ok.validation.valide).toBe(true);
    expect(ok.plan[0]).toMatchObject({ pivote: true, x: 2, y: 1 });
  });

  it("déplacer : le module change de case s'il ne chevauche rien, sinon le plan ne change pas", () => {
    const plan: ModulePlace[] = [
      { module_type_id: poste.id, x: 2, y: 1, pivote: false },
      { module_type_id: poste.id, x: 5, y: 1, pivote: false },
    ];
    const ok = deplacerModule(atelier, plan, 0, { x: 8, y: 1 }, catalogue);
    expect(ok.validation.valide).toBe(true);
    expect(ok.plan).toEqual([{ ...plan[0]!, x: 8 }, plan[1]]);
    // Le module ne se gêne pas lui-même : le décaler d'une case est permis.
    expect(deplacerModule(atelier, plan, 0, { x: 1, y: 1 }, catalogue).validation.valide).toBe(true);
    const ko = deplacerModule(atelier, plan, 0, { x: 5, y: 2 }, catalogue);
    expect(ko.validation.valide).toBe(false);
    expect(ko.plan).toEqual(plan);
  });
});
