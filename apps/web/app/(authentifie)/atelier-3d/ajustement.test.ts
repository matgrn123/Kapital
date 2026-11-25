import { describe, it, expect } from "vitest";
import { echelleDansEmprise } from "./ajustement";

describe("echelleDansEmprise", () => {
  it("agrandit un petit meuble pour remplir l'emprise, avec une marge", () => {
    // meuble 0.5 x 0.4, emprise 2 x 2 cases : limité par la largeur (0.5)
    expect(echelleDansEmprise([0.5, 0.5, 0.4], 2, 2, 0.8)).toBeCloseTo(3.2, 6);
  });

  it("prend la dimension la plus contraignante", () => {
    expect(echelleDansEmprise([1, 1, 2], 2, 1, 1)).toBeCloseTo(0.5, 6);
  });

  it("plafonne la hauteur", () => {
    // meuble haut et fin : sans plafond il dépasserait 2.4 de haut
    const e = echelleDansEmprise([0.2, 2, 0.2], 1, 1, 1, 2.4);
    expect(2 * e).toBeLessThanOrEqual(2.4 + 1e-9);
  });

  it("renvoie 1 pour un modèle sans volume", () => {
    expect(echelleDansEmprise([0, 0, 0], 1, 1)).toBe(1);
  });
});
