import { describe, expect, it } from "vitest";
import { chargerParametresV1 } from "@kapital/content";
import { coefficientsMarketingDepuisParametres, planComptableV1 } from "@kapital/engine";
import {
  ACTIONS_MARKETING,
  COMPTE_MARKETING,
  confirmationDepense,
  estActionMarketing,
  marqueApresAction,
} from "./marketing";
import { PLAN_COMPTABLE } from "./comptes";

const P = chargerParametresV1();

// Ancienne formule recopiée dans la route (non-régression).
const K: Record<string, { n: number; d: number }> = {
  publicite: { n: 2.0, d: 0 },
  image_marque: { n: 0, d: 2.0 },
  promotion: { n: 1.0, d: -1.5 },
  relations_presse: { n: 1.5, d: 1.5 },
};
const borne = (x: number) => Math.max(0, Math.min(100, x));
function ancienne(n0: number, d0: number, type: string, montant: number) {
  const m = Math.log(1 + montant / 100);
  return { notoriete: borne(n0 + K[type]!.n * m), desirabilite: borne(d0 + K[type]!.d * m) };
}

describe("marqueApresAction", () => {
  for (const type of Object.keys(K)) {
    for (const [n0, d0, montant] of [[0, 0, 100_000], [40, 60, 12_345], [95, 3, 5_000_000]] as const) {
      it(`${type} ${montant} centimes depuis (${n0}, ${d0}) : même résultat que l'ancienne formule`, () => {
        const r = marqueApresAction({ notoriete: n0, desirabilite: d0 }, type as never, montant, P);
        const a = ancienne(n0, d0, type, montant);
        expect(r.notoriete).toBeCloseTo(a.notoriete, 10);
        expect(r.desirabilite).toBeCloseTo(a.desirabilite, 10);
      });
    }
  }
});

describe("marqueApresAction avec un aléa (influenceur)", () => {
  it("applique l'aléa tiré par la route ; sans aléa, l'effet moyen", () => {
    const c = coefficientsMarketingDepuisParametres(P);
    const r = c.actions.influenceur_micro;
    const m = Math.log(1 + 500);
    const moyen = marqueApresAction({ notoriete: 10, desirabilite: 10 }, "influenceur_micro", 50_000, P);
    const chanceux = marqueApresAction({ notoriete: 10, desirabilite: 10 }, "influenceur_micro", 50_000, P, 1.3);
    expect(moyen.notoriete).toBeCloseTo(10 + r.kNotoriete * m, 10);
    expect(chanceux.notoriete).toBeCloseTo(10 + r.kNotoriete * m * 1.3, 10);
  });

  it("la liste de l'interface est celle du moteur (dix actions)", () => {
    expect(ACTIONS_MARKETING).toHaveLength(10);
    expect(estActionMarketing("influenceur_nano")).toBe(true);
    expect(estActionMarketing("affichage_tramway")).toBe(false);
  });
});

describe("compte marketing", () => {
  it("623 existe dans le plan comptable du moteur et dans la liste de l'interface", () => {
    expect(COMPTE_MARKETING).toBe("623");
    expect(planComptableV1().comptes["623"]).toBeDefined();
    expect(PLAN_COMPTABLE.some((c) => c.numero === "623")).toBe(true);
  });
});

describe("confirmationDepense", () => {
  it("ne demande rien pour une petite dépense", () => {
    expect(confirmationDepense(229100, 2291150)).toBeNull();
  });
  it("demande confirmation au-delà de la moitié de la trésorerie, avec le pourcentage", () => {
    expect(confirmationDepense(2291100, 2291150)).toBe(
      "Tu vas dépenser 22\u202f911,00 €, soit 100 % de ta trésorerie. Il ne te restera que 0,50 € pour payer salaires et loyers en fin de mois.",
    );
  });
  it("ne demande rien quand la trésorerie est nulle (l'aperçu refuse déjà)", () => {
    expect(confirmationDepense(100, 0)).toBeNull();
  });
});
