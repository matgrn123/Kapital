import { describe, it, expect } from "vitest";
import { echelleGraphique, equilibreEcriture, pourcentageJauge } from "./calculs";

describe("pourcentageJauge", () => {
  it("donne la part remplie en pourcentage", () => {
    expect(pourcentageJauge(25, 100)).toBe(25);
    expect(pourcentageJauge(1, 3)).toBeCloseTo(33.333, 2);
  });

  it("reste entre 0 et 100", () => {
    expect(pourcentageJauge(150, 100)).toBe(100);
    expect(pourcentageJauge(-5, 100)).toBe(0);
  });

  it("vaut 0 quand le maximum est nul ou négatif", () => {
    expect(pourcentageJauge(10, 0)).toBe(0);
    expect(pourcentageJauge(10, -1)).toBe(0);
  });
});

describe("echelleGraphique", () => {
  it("arrondit le haut de l'échelle à un pas lisible", () => {
    const e = echelleGraphique([1_200_00, 3_400_00]);
    expect(e.pas).toBe(500_00);
    expect(e.max).toBe(3_500_00);
    expect(e.graduations).toEqual([0, 500_00, 1_000_00, 1_500_00, 2_000_00, 2_500_00, 3_000_00, 3_500_00]);
  });

  it("prend un pas plus grand pour de grands montants", () => {
    expect(echelleGraphique([9_000_00]).pas).toBe(2_000_00);
    expect(echelleGraphique([5_000_00]).pas).toBe(1_000_00);
  });

  it("garde une échelle minimale quand tout est à zéro ou vide", () => {
    const vide = echelleGraphique([]);
    expect(vide.max).toBe(1_000_00);
    expect(echelleGraphique([0, 0]).max).toBe(1_000_00);
  });

  it("ignore les valeurs négatives pour le haut de l'échelle", () => {
    expect(echelleGraphique([-2_000_00, 300_00]).max).toBe(1_000_00);
  });
});

describe("equilibreEcriture", () => {
  it("additionne débits et crédits et dit si l'écriture est équilibrée", () => {
    expect(
      equilibreEcriture([
        { compte: "512", debit: 10_000_00 },
        { compte: "164", credit: 10_000_00 },
      ]),
    ).toEqual({ debit: 10_000_00, credit: 10_000_00, equilibree: true });
  });

  it("repère une écriture déséquilibrée", () => {
    expect(
      equilibreEcriture([
        { compte: "613", debit: 1_000_00 },
        { compte: "512", credit: 900_00 },
      ]).equilibree,
    ).toBe(false);
  });
});
