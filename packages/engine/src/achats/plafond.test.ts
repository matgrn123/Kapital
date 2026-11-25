import { describe, expect, it } from "vitest";
import { eurosTexte } from "../types/euros.js";
import { quantiteMaxPayable, verifierQuantiteCommande } from "./plafond.js";

describe("eurosTexte", () => {
  it("écrit les euros avec séparateur de milliers et virgule", () => {
    expect(eurosTexte(100500000)).toBe("1 005 000,00 €");
    expect(eurosTexte(50)).toBe("0,50 €");
    expect(eurosTexte(-123456)).toBe("-1 234,56 €");
  });
});

describe("quantiteMaxPayable", () => {
  it("donne le nombre d'unités que la trésorerie peut payer", () => {
    expect(quantiteMaxPayable(2291150, 500)).toBe(4582);
  });
  it("vaut 0 sans trésorerie", () => {
    expect(quantiteMaxPayable(0, 500)).toBe(0);
    expect(quantiteMaxPayable(-100, 500)).toBe(0);
  });
  it("n'impose pas de plafond si le prix est nul", () => {
    expect(quantiteMaxPayable(1000, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("verifierQuantiteCommande", () => {
  const base = { minimum: 50, prixUnitaire: 500, tresorerie: 2291150 };

  it("accepte une commande payable", () => {
    expect(verifierQuantiteCommande({ ...base, quantite: 100 })).toEqual({ ok: true });
  });

  it("accepte une commande qui coûte exactement la trésorerie", () => {
    expect(verifierQuantiteCommande({ minimum: 1, prixUnitaire: 500, tresorerie: 5000, quantite: 10 })).toEqual({
      ok: true,
    });
  });

  it("refuse une quantité à virgule, nulle ou négative", () => {
    for (const quantite of [2.5, 0, -3, Number.NaN]) {
      const r = verifierQuantiteCommande({ ...base, quantite });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("quantite_invalide");
    }
  });

  it("refuse sous le minimum", () => {
    const r = verifierQuantiteCommande({ ...base, quantite: 10 });
    expect(r).toMatchObject({ ok: false, code: "sous_minimum" });
  });

  it("refuse une commande que la trésorerie ne peut pas payer, montant manquant chiffré", () => {
    const r = verifierQuantiteCommande({ ...base, quantite: 99999999 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("tresorerie_insuffisante");
    expect(r.message).toBe(
      "Trésorerie insuffisante : cette commande coûte 499 999 995,00 €, tu as 22 911,50 €, il manque 499 977 083,50 €. " +
        "Tu peux commander au plus 4 582.",
    );
  });

  it("refuse un centime au-dessus de la trésorerie", () => {
    const r = verifierQuantiteCommande({ minimum: 1, prixUnitaire: 500, tresorerie: 4999, quantite: 10 });
    expect(r).toMatchObject({ ok: false, code: "tresorerie_insuffisante" });
  });
});
