import { describe, expect, it } from "vitest";
import { validerSaisiePrix } from "./saisiePrix.js";

const ok = { prixVenteDirecteCentimes: 2800, prixRevendeurCentimes: 1200, productionMensuelleCible: 100, qualiteVisee: 60 };

describe("validerSaisiePrix", () => {
  it("accepte une saisie normale et la renvoie normalisée", () => {
    expect(validerSaisiePrix(ok)).toEqual({ ok: true, valeurs: { pd: 2800, pr: 1200, prod: 100, q: 60 } });
  });

  it("garde les valeurs par défaut (production 0, qualité 60)", () => {
    expect(validerSaisiePrix({ prixVenteDirecteCentimes: 2800, prixRevendeurCentimes: 1200 })).toEqual({
      ok: true,
      valeurs: { pd: 2800, pr: 1200, prod: 0, q: 60 },
    });
  });

  it("refuse des prix négatifs, nuls ou à virgule de centime", () => {
    for (const pd of [-100, 0, 19.5]) {
      expect(validerSaisiePrix({ ...ok, prixVenteDirecteCentimes: pd }).ok).toBe(false);
    }
    expect(validerSaisiePrix({ ...ok, prixRevendeurCentimes: 0 }).ok).toBe(false);
  });

  it("refuse une production mensuelle négative ou à virgule", () => {
    const r = validerSaisiePrix({ ...ok, productionMensuelleCible: -5 });
    expect(r).toMatchObject({ ok: false, code: "production_invalide" });
    expect(validerSaisiePrix({ ...ok, productionMensuelleCible: 2.5 }).ok).toBe(false);
  });

  it("refuse une qualité hors de 0 à 100 ou à virgule", () => {
    expect(validerSaisiePrix({ ...ok, qualiteVisee: 500 })).toMatchObject({ ok: false, code: "qualite_invalide" });
    expect(validerSaisiePrix({ ...ok, qualiteVisee: -1 }).ok).toBe(false);
    expect(validerSaisiePrix({ ...ok, qualiteVisee: 60.5 }).ok).toBe(false);
  });
});
