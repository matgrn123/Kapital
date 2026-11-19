import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { centimes } from "../types/primitifs.js";
import {
  coefficientsDepuisParametres,
  effetAction,
  moisDeMarque,
} from "./jauges.js";

function coeffs() {
  return coefficientsDepuisParametres(chargerParametresV1());
}

describe("décroissance mensuelle", () => {
  it("notoriété décroît de 5 % par mois sans action", () => {
    const c = coeffs();
    const apres = moisDeMarque({ notoriete: 50, desirabilite: 50 }, [], c);
    expect(apres.notoriete).toBeCloseTo(50 * 0.95, 5);
  });

  it("désirabilité décroît de 2 % par mois sans action", () => {
    const c = coeffs();
    const apres = moisDeMarque({ notoriete: 50, desirabilite: 50 }, [], c);
    expect(apres.desirabilite).toBeCloseTo(50 * 0.98, 5);
  });
});

describe("effet par action", () => {
  it("publicité monte la notoriété et ne touche pas la désirabilité", () => {
    const c = coeffs();
    const e = effetAction(
      { action: "publicite", montant: centimes(100_000) },
      c,
    );
    expect(e.deltaNotoriete).toBeGreaterThan(0);
    expect(e.deltaDesirabilite).toBe(0);
  });

  it("image_marque monte la désirabilité et ne touche pas la notoriété", () => {
    const c = coeffs();
    const e = effetAction(
      { action: "image_marque", montant: centimes(100_000) },
      c,
    );
    expect(e.deltaNotoriete).toBe(0);
    expect(e.deltaDesirabilite).toBeGreaterThan(0);
  });

  it("relations_presse monte les deux jauges", () => {
    const c = coeffs();
    const e = effetAction(
      { action: "relations_presse", montant: centimes(100_000) },
      c,
    );
    expect(e.deltaNotoriete).toBeGreaterThan(0);
    expect(e.deltaDesirabilite).toBeGreaterThan(0);
  });
});

describe("critère T09 : promotion monte la notoriété et baisse la désirabilité", () => {
  it("effet immédiat d'une promotion", () => {
    const c = coeffs();
    const e = effetAction(
      { action: "promotion", montant: centimes(100_000) },
      c,
    );
    expect(e.deltaNotoriete).toBeGreaterThan(0);
    expect(e.deltaDesirabilite).toBeLessThan(0);
  });

  it("après un mois avec promotion : noto > avant, désir < avant", () => {
    const c = coeffs();
    const avant = { notoriete: 40, desirabilite: 40 };
    const apres = moisDeMarque(
      avant,
      [{ action: "promotion", montant: centimes(100_000) }],
      c,
    );
    expect(apres.notoriete).toBeGreaterThan(avant.notoriete);
    expect(apres.desirabilite).toBeLessThan(avant.desirabilite);
  });

  it("promotion de 500 € pèse plus qu'une promotion de 50 €", () => {
    const c = coeffs();
    const petite = effetAction(
      { action: "promotion", montant: centimes(5000) },
      c,
    );
    const grosse = effetAction(
      { action: "promotion", montant: centimes(50_000) },
      c,
    );
    expect(grosse.deltaNotoriete).toBeGreaterThan(petite.deltaNotoriete);
    expect(grosse.deltaDesirabilite).toBeLessThan(petite.deltaDesirabilite);
  });
});

describe("bornes 0 à 100", () => {
  it("notoriété ne monte pas au-dessus de 100", () => {
    const c = coeffs();
    const apres = moisDeMarque(
      { notoriete: 90, desirabilite: 50 },
      [{ action: "publicite", montant: centimes(100_000_000) }],
      c,
    );
    expect(apres.notoriete).toBeLessThanOrEqual(100);
  });

  it("désirabilité ne descend pas sous 0", () => {
    const c = coeffs();
    const apres = moisDeMarque(
      { notoriete: 50, desirabilite: 2 },
      [{ action: "promotion", montant: centimes(10_000_000) }],
      c,
    );
    expect(apres.desirabilite).toBeGreaterThanOrEqual(0);
  });

  it("notoriété à 0 sans action reste à 0", () => {
    const c = coeffs();
    const apres = moisDeMarque({ notoriete: 0, desirabilite: 0 }, [], c);
    expect(apres.notoriete).toBe(0);
    expect(apres.desirabilite).toBe(0);
  });
});

describe("robustesse", () => {
  it("accepte un montant à 0 : aucun effet", () => {
    const c = coeffs();
    const e = effetAction(
      { action: "publicite", montant: centimes(0) },
      c,
    );
    expect(e.deltaNotoriete).toBe(0);
    expect(e.deltaDesirabilite).toBe(0);
  });

  it("plusieurs actions sur le même mois s'additionnent", () => {
    const c = coeffs();
    const apres = moisDeMarque(
      { notoriete: 30, desirabilite: 30 },
      [
        { action: "publicite", montant: centimes(100_000) },
        { action: "image_marque", montant: centimes(100_000) },
      ],
      c,
    );
    const pubSeule = moisDeMarque(
      { notoriete: 30, desirabilite: 30 },
      [{ action: "publicite", montant: centimes(100_000) }],
      c,
    );
    expect(apres.notoriete).toBeCloseTo(pubSeule.notoriete, 5);
    expect(apres.desirabilite).toBeGreaterThan(pubSeule.desirabilite);
  });
});
