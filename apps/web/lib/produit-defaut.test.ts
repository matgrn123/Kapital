import { describe, expect, it } from "vitest";
import { chargerParametresV1 } from "@kapital/content";
import { reglagesProduitDefaut } from "./produit-defaut";

const P = chargerParametresV1();

describe("reglagesProduitDefaut", () => {
  it("reprend les anciens défauts, désormais dans les paramètres", () => {
    expect(reglagesProduitDefaut("entree", P)).toEqual({ qualite_visee: 60, prix_vente_directe_centimes: 2000, prix_revendeur_centimes: 1000, production_mensuelle_cible: 100 });
    expect(reglagesProduitDefaut("milieu", P).prix_vente_directe_centimes).toBe(6000);
    expect(reglagesProduitDefaut("haut", P).prix_revendeur_centimes).toBe(7500);
  });
  it("prix entiers (centimes) et revendeur sous la vente directe", () => {
    for (const g of ["entree", "milieu", "haut"] as const) {
      const r = reglagesProduitDefaut(g, P);
      expect(Number.isInteger(r.prix_vente_directe_centimes)).toBe(true);
      expect(r.prix_revendeur_centimes).toBeLessThan(r.prix_vente_directe_centimes);
    }
  });
  it("refuse un paramètre manquant", () => {
    const sans = { ...P };
    delete sans["produit_defaut_qualite_visee"];
    expect(() => reglagesProduitDefaut("entree", sans)).toThrow(/produit_defaut_qualite_visee/);
  });
});
