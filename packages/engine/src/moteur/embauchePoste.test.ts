import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import type { Entreprise, Salarie } from "../types/entreprise.js";
import { centimes, idEntreprise, idMatiere, idProduit, idSalarie } from "../types/primitifs.js";
import { planProductionDuMois } from "./flux.js";
import { postesALaSignature, resoudreModules } from "../atelier/effetsPlan.js";
import { chargerModulesV1 } from "@kapital/content";

const MODULES_CATALOGUE = chargerModulesV1();

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
    atelier: { surfaceM2: 100, loyerMensuel: centimes(100_000), modules: postesALaSignature(machines, MODULES_CATALOGUE) },
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [],
    catalogue: [
      {
        produit: idProduit("prod_tshirt"),
        qualiteVisee: 3,
        prix: { vente_directe: centimes(3000), revendeur: centimes(2000) },
        productionMensuelleCible: 10_000,
        fabrication: {
          matiere: idMatiere("mat_jersey_coton"),
          consommationParPiece: 0.8,
          fournituresParPiece: centimes(60),
          tempsStandardMinutes: 30,
        },
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

describe("3D-3 : la production suit les postes posés dans le plan", () => {
  it("0 poste posé : 0 production, même avec 3 artisans", () => {
    expect(total(entreprise([salarie("a", 12), salarie("b", 12), salarie("c", 12)], 0))).toBe(0);
  });

  it("retirer un poste du plan fait baisser la production", () => {
    const equipe = [salarie("a", 12), salarie("b", 12)];
    const deux = entreprise(equipe, 2);
    const un = { ...deux, atelier: { ...deux.atelier!, modules: deux.atelier!.modules.slice(1) } };
    expect(total(un)).toBeLessThan(total(deux));
    expect(total(un)).toBeGreaterThan(0);
  });

  it("un module qui n'est pas un poste (table de coupe) n'ajoute pas de capacité", () => {
    const equipe = [salarie("a", 12), salarie("b", 12)];
    const un = entreprise(equipe, 1);
    const avecTable = {
      ...un,
      atelier: {
        ...un.atelier!,
        modules: [
          ...un.atelier!.modules,
          ...resoudreModules([{ id_type: "table_coupe_simple", x: 2, y: 4, pivote: true }], MODULES_CATALOGUE),
        ],
      },
    };
    expect(total(avecTable)).toBe(total(un));
  });
});
