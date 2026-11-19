import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import type { Gamme } from "../types/entreprise.js";
import { graine } from "../types/primitifs.js";
import { simulerBancEssai } from "./bancEssai.js";

const GAMMES: readonly Gamme[] = ["entree", "milieu", "haut"] as const;

describe("banc d'essai PNJ — critère T14", () => {
  it("20 PNJ, 120 mois : pas de prix négatif à aucun moment", () => {
    const h = simulerBancEssai(120, 20, chargerParametresV1(), graine(42));
    expect(h).toHaveLength(120);
    for (const pas of h) {
      for (const p of pas.pnj) {
        expect(p.prix, `mois ${pas.mois}, pnj ${p.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("20 PNJ, 120 mois : aucun PNJ n'atteint 95 % de part (pas de monopole)", () => {
    const h = simulerBancEssai(120, 20, chargerParametresV1(), graine(42));
    for (const pas of h) {
      for (const g of GAMMES) {
        expect(
          pas.parSegment[g].partMaxFirme,
          `mois ${pas.mois}, segment ${g}`,
        ).toBeLessThan(0.95);
      }
    }
  });

  it("20 PNJ, 120 mois : la frange garde entre 20 et 95 % du marché à chaque segment", () => {
    const h = simulerBancEssai(120, 20, chargerParametresV1(), graine(42));
    for (const pas of h) {
      for (const g of GAMMES) {
        const pf = pas.parSegment[g].partFrange;
        expect(pf, `mois ${pas.mois}, segment ${g}, partFrange`).toBeGreaterThanOrEqual(0.2);
        expect(pf, `mois ${pas.mois}, segment ${g}, partFrange`).toBeLessThanOrEqual(0.95);
      }
    }
  });
});

describe("banc d'essai — déterminisme", () => {
  it("même graine → même historique", () => {
    const h1 = simulerBancEssai(60, 12, chargerParametresV1(), graine(99));
    const h2 = simulerBancEssai(60, 12, chargerParametresV1(), graine(99));
    expect(h1).toEqual(h2);
  });

  it("graines différentes → historiques différents", () => {
    const h1 = simulerBancEssai(30, 9, chargerParametresV1(), graine(1));
    const h2 = simulerBancEssai(30, 9, chargerParametresV1(), graine(2));
    expect(h1).not.toEqual(h2);
  });
});

describe("robustesse", () => {
  it("refuse nbMois ou nbPnj négatifs/nuls", () => {
    expect(() => simulerBancEssai(0, 10, chargerParametresV1(), graine(1))).toThrow();
    expect(() => simulerBancEssai(10, 0, chargerParametresV1(), graine(1))).toThrow();
  });

  it("répartition : 20 PNJ se répartissent sur les 3 segments", () => {
    const h = simulerBancEssai(1, 20, chargerParametresV1(), graine(1));
    const premier = h[0]!;
    const comptes: Record<Gamme, number> = { entree: 0, milieu: 0, haut: 0 };
    for (const p of premier.pnj) {
      comptes[p.gamme] += 1;
    }
    expect(comptes.entree + comptes.milieu + comptes.haut).toBe(20);
    for (const g of GAMMES) {
      expect(comptes[g]).toBeGreaterThan(0);
    }
  });
});
