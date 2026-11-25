import { describe, it, expect } from "vitest";
import { dateDeJeu, ventesParJour } from "./cadre";

// Un mois de jeu = 1 440 pas ; on l'affiche en 30 jours de jeu.
describe("dateDeJeu", () => {
  it("donne le mois et le jour de jeu", () => {
    expect(dateDeJeu(10, 0, 1440)).toBe("mois 10, jour 1");
    expect(dateDeJeu(10, 47, 1440)).toBe("mois 10, jour 1");
    expect(dateDeJeu(10, 48, 1440)).toBe("mois 10, jour 2");
    expect(dateDeJeu(3, 1439, 1440)).toBe("mois 3, jour 30");
  });

  it("reste lisible si le nombre de pas est invalide", () => {
    expect(dateDeJeu(4, 12, 0)).toBe("mois 4");
  });
});

describe("ventesParJour", () => {
  it("divise le chiffre d'affaires du mois par les jours écoulés, arrondi au centime", () => {
    // 10 jours écoulés (index 432 sur 1 440 = 30 %, soit 9 jours pleins + le jour en cours)
    expect(ventesParJour(1_000_00, 432, 1440)).toBe(10_000);
  });

  it("compte le premier jour comme un jour entier", () => {
    expect(ventesParJour(250_00, 0, 1440)).toBe(250_00);
  });

  it("ne descend pas sous zéro (retours plus élevés que les ventes)", () => {
    expect(ventesParJour(-50_00, 100, 1440)).toBe(0);
  });
});
