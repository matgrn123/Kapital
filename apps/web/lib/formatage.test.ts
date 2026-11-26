import { describe, expect, it } from "vitest";

// Comme sur Vercel : le serveur tourne en UTC.
process.env.TZ = "UTC";
import { formaterDate, formaterDateHeure, prixParUnite, quantiteMatiere, symboleUnite } from "./formatage";

// Les pages sont rendues sur le serveur (UTC chez Vercel) : l'heure doit être celle de Paris.
describe("formatage des dates à l'heure de Paris", () => {
  it("affiche 13:44 pour une livraison à 12:44 UTC (heure d'hiver)", () => {
    expect(formaterDateHeure("2026-11-25T12:44:00Z")).toContain("13:44");
  });
  it("affiche 14:44 pour 12:44 UTC en été", () => {
    expect(formaterDateHeure("2026-07-01T12:44:00Z")).toContain("14:44");
  });
  it("change de jour selon Paris, pas selon UTC", () => {
    expect(formaterDate("2026-11-25T23:30:00Z")).toMatch(/^26/);
  });
});

// Une quantité de matière se lit toujours avec son unité (« 300 m de jersey »).
const espaces = (t: string) => t.replace(/\s/g, " ");

describe("quantiteMatiere", () => {
  it("écrit les mètres en abrégé, avec le nom de la matière en minuscule", () => {
    expect(espaces(quantiteMatiere(300, "metre", "Jersey de coton bio"))).toBe("300 m de jersey de coton bio");
    expect(espaces(quantiteMatiere(1500, "metre", "Popeline de coton"))).toBe("1 500 m de popeline de coton");
  });
  it("accorde le lot et retire la mention d'unité du nom", () => {
    expect(quantiteMatiere(1, "lot", "Fournitures (lot)")).toBe("1 lot de fournitures");
    expect(quantiteMatiere(3, "lot", "Fournitures (lot)")).toBe("3 lots de fournitures");
  });
  it("élide « de » devant une voyelle", () => {
    expect(quantiteMatiere(20, "metre", "Organza")).toBe("20 m d'organza");
  });
  it("garde une unité inconnue telle quelle", () => {
    expect(quantiteMatiere(4, "rouleau", "Toile")).toBe("4 rouleau de toile");
  });
});

describe("prixParUnite", () => {
  it("donne le prix au mètre ou au lot", () => {
    expect(espaces(prixParUnite(350, "metre"))).toBe("3,50 € le mètre");
    expect(espaces(prixParUnite(1200, "lot"))).toBe("12,00 € le lot");
    expect(espaces(prixParUnite(99, "rouleau"))).toBe("0,99 € l'unité");
  });
});

describe("symboleUnite", () => {
  it("donne l'unité courte d'un curseur de quantité", () => {
    expect(symboleUnite("metre", 300)).toBe("m");
    expect(symboleUnite("lot", 1)).toBe("lot");
    expect(symboleUnite("lot", 2)).toBe("lots");
  });
});
