import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import type { Entreprise, Salarie } from "../types/entreprise.js";
import { centimes, idEntreprise, idProduit, idSalarie } from "../types/primitifs.js";
import { planProductionDuMois } from "./flux.js";

const PARAMS = chargerParametresV1();

function salarie(id: string, experienceMois: number): Salarie {
  return {
    id: idSalarie(id),
    poste: "artisan",
    salaireBrutMensuel: centimes(200_000),
    ancienneteMois: experienceMois,
    experienceMois,
  };
}

function entreprise(salaries: readonly Salarie[], machines: number): Entreprise {
  return {
    id: idEntreprise("ent_test"),
    nom: "Test SAS",
    gamme: "milieu",
    etape: 2,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(10_000_000),
    stocksMatiere: [],
    stocksFinis: [],
    salaries,
    atelier: { surfaceM2: 100, loyerMensuel: centimes(100_000), nombreMachines: machines },
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [],
    catalogue: [
      {
        produit: idProduit("prod_tshirt"),
        qualiteVisee: 3,
        prix: { vente_directe: centimes(3000), revendeur: centimes(2000) },
        productionMensuelleCible: 10_000,
      },
    ],
  };
}

const total = (e: Entreprise) => planProductionDuMois(e, PARAMS).reduce((s, l) => s + l.pieces, 0);

describe("AE-7 : embauche et production", () => {
  it("embaucher sans poste libre n'augmente pas la production", () => {
    const avant = entreprise([salarie("a", 12)], 1);
    const apres = entreprise([salarie("a", 12), salarie("debutant", 0)], 1);
    expect(total(apres)).toBe(total(avant));
    expect(total(avant)).toBeGreaterThan(0);
  });

  it("l'artisan en trop ne fait pas baisser le rendement des artisans au poste", () => {
    const avant = entreprise([salarie("a", 24), salarie("b", 24)], 2);
    const apres = entreprise([salarie("a", 24), salarie("b", 24), salarie("debutant", 0)], 2);
    expect(total(apres)).toBe(total(avant));
  });

  it("embaucher sur un poste libre augmente la production, malgré le rendement du débutant", () => {
    const avant = entreprise([salarie("a", 12)], 2);
    const apres = entreprise([salarie("a", 12), salarie("debutant", 0)], 2);
    expect(total(apres)).toBeGreaterThan(total(avant));
  });

  it("le débutant sur un poste libre rend moins qu'un ancien", () => {
    const ancien = entreprise([salarie("a", 12), salarie("b", 36)], 2);
    const debutant = entreprise([salarie("a", 12), salarie("b", 0)], 2);
    expect(total(debutant)).toBeLessThan(total(ancien));
  });

  it("sans machine, personne ne produit", () => {
    expect(total(entreprise([salarie("a", 12)], 0))).toBe(0);
  });
});
