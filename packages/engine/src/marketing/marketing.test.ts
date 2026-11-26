import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { centimes } from "../types/primitifs.js";
import { graineDepuis } from "../moteur/rng.js";
import {
  aleaMarketing,
  coefficientsMarketingDepuisParametres,
  effetAction,
  fourchetteAlea,
  honorairesMarketing,
  moisDeMarque,
  verifierActionMarketing,
} from "./jauges.js";

function coeffs() {
  return coefficientsMarketingDepuisParametres(chargerParametresV1());
}

describe("décroissance mensuelle", () => {
  it("notoriété décroît selon exp(-0,05 × durée) par mois sans action", () => {
    const c = coeffs();
    const apres = moisDeMarque({ notoriete: 50, desirabilite: 50 }, [], c);
    expect(apres.notoriete).toBeCloseTo(50 * Math.exp(-0.05), 5);
  });

  it("désirabilité décroît selon exp(-0,02 × durée) par mois sans action", () => {
    const c = coeffs();
    const apres = moisDeMarque({ notoriete: 50, desirabilite: 50 }, [], c);
    expect(apres.desirabilite).toBeCloseTo(50 * Math.exp(-0.02), 5);
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

// ---------------------------------------------------------------------------
// Nouvelles publicités : influenceurs, réseaux sociaux, métro, agence
// ---------------------------------------------------------------------------

const P = chargerParametresV1();
const v = (cle: string): number => P[cle]!.valeur;

describe("les quatre actions d'origine donnent exactement le même résultat qu'avant", () => {
  // Ancienne formule, recopiée telle quelle (avant la table des coefficients).
  function ancienEffet(action: string, montant: number, c: ReturnType<typeof coeffs>) {
    const m = Math.log(1 + Math.max(0, montant / 100));
    switch (action) {
      case "publicite":
        return { deltaNotoriete: c.kNotorietePublicite * m, deltaDesirabilite: 0 };
      case "image_marque":
        return { deltaNotoriete: 0, deltaDesirabilite: c.kDesirabiliteImage * m };
      case "promotion":
        return { deltaNotoriete: c.kNotorietePromotion * m, deltaDesirabilite: -c.kDesirabilitePromotionNegatif * m };
      default:
        return { deltaNotoriete: c.kNotorieteRp * m, deltaDesirabilite: c.kDesirabiliteRp * m };
    }
  }
  const c = coeffs();
  for (const action of ["publicite", "image_marque", "promotion", "relations_presse"] as const) {
    for (const montant of [0, 1, 999, 12_345, 100_000, 5_000_000]) {
      it(`${action}, ${montant} centimes : identique au bit près, même avec un aléa fourni`, () => {
        const attendu = ancienEffet(action, montant, c);
        expect(effetAction({ action, montant: centimes(montant) }, c)).toEqual(attendu);
        expect(effetAction({ action, montant: centimes(montant), alea: 1.5 }, c)).toEqual(attendu);
      });
    }
  }
});

describe("table des coefficients", () => {
  it("chaque nouvelle action lit ses k, son minimum et son aléa dans les paramètres", () => {
    const c = coeffs();
    expect(c.actions.influenceur_nano).toMatchObject({
      kNotoriete: v("marketing_k_notoriete_influenceur_nano"),
      kDesirabilite: v("marketing_k_desirabilite_influenceur_nano"),
      montantMinimum: v("marketing_montant_min_influenceur_nano"),
      amplitudeAlea: v("marketing_alea_amplitude_influenceur_nano"),
      tauxHonoraires: 0,
    });
    expect(c.actions.affichage_metro.etapeMinimum).toBe(v("marketing_etape_min_affichage_metro"));
    expect(c.actions.agence_publicite.tauxHonoraires).toBe(v("marketing_honoraires_agence_taux"));
    expect(c.actions.reseaux_sociaux.coutPourMilleAffichages).toBe(v("marketing_cpm_reseaux_sociaux"));
    for (const a of ["reseaux_sociaux", "affichage_metro", "agence_publicite"] as const) {
      expect(c.actions[a].amplitudeAlea).toBe(0);
    }
  });

  it("les petits comptes ont un aléa plus faible que les gros, toujours sous 1", () => {
    const c = coeffs();
    const nano = c.actions.influenceur_nano.amplitudeAlea;
    const micro = c.actions.influenceur_micro.amplitudeAlea;
    const macro = c.actions.influenceur_macro.amplitudeAlea;
    expect(nano).toBeGreaterThan(0);
    expect(nano).toBeLessThan(micro);
    expect(micro).toBeLessThan(macro);
    expect(macro).toBeLessThan(1);
  });

  it("effet = k × ln(1 + montant en euros) × aléa", () => {
    const c = coeffs();
    const r = c.actions.influenceur_micro;
    const e = effetAction({ action: "influenceur_micro", montant: centimes(50_000), alea: 1.2 }, c);
    expect(e.deltaNotoriete).toBeCloseTo(r.kNotoriete * Math.log(1 + 500) * 1.2, 12);
    expect(e.deltaDesirabilite).toBeCloseTo(r.kDesirabilite * Math.log(1 + 500) * 1.2, 12);
  });

  it("un aléa hors de la fourchette est ramené à sa borne", () => {
    const c = coeffs();
    const a = c.actions.influenceur_nano.amplitudeAlea;
    const trop = effetAction({ action: "influenceur_nano", montant: centimes(10_000), alea: 5 }, c);
    const borne = effetAction({ action: "influenceur_nano", montant: centimes(10_000), alea: 1 + a }, c);
    expect(trop).toEqual(borne);
  });
});

describe("aléa des influenceurs (aleaMarketing)", () => {
  const c = coeffs();
  const tirage = { societe: "6f1c2a0e-1111-4222-8333-944455556666", mois: 7, rang: 0 };

  it("même graine (société, mois, rang) : même aléa, donc même effet", () => {
    const a1 = aleaMarketing("influenceur_macro", c, tirage);
    const a2 = aleaMarketing("influenceur_macro", c, { ...tirage });
    expect(a1).toBe(a2);
    const e1 = effetAction({ action: "influenceur_macro", montant: centimes(200_000), alea: a1 }, c);
    const e2 = effetAction({ action: "influenceur_macro", montant: centimes(200_000), alea: a2 }, c);
    expect(e1).toEqual(e2);
  });

  it("un influenceur lancé deux fois dans le mois ne donne pas le même effet", () => {
    const a0 = aleaMarketing("influenceur_macro", c, tirage);
    const a1 = aleaMarketing("influenceur_macro", c, { ...tirage, rang: 1 });
    expect(a0).not.toBe(a1);
    expect(aleaMarketing("influenceur_macro", c, { ...tirage, mois: 8 })).not.toBe(a0);
    expect(aleaMarketing("influenceur_macro", c, { ...tirage, societe: "autre" })).not.toBe(a0);
  });

  it("l'aléa reste dans sa fourchette 1 ± amplitude, sur 2 000 tirages, et la couvre", () => {
    for (const action of ["influenceur_nano", "influenceur_micro", "influenceur_macro"] as const) {
      const amp = c.actions[action].amplitudeAlea;
      const f = fourchetteAlea(action, c);
      expect(f).toEqual({ min: 1 - amp, max: 1 + amp });
      let min = Infinity;
      let max = -Infinity;
      let somme = 0;
      for (let rang = 0; rang < 2000; rang++) {
        const a = aleaMarketing(action, c, { ...tirage, rang });
        expect(a).toBeGreaterThanOrEqual(f.min);
        expect(a).toBeLessThanOrEqual(f.max);
        min = Math.min(min, a);
        max = Math.max(max, a);
        somme += a;
      }
      // Les tirages se répartissent dans toute la fourchette, centrés sur 1.
      expect(min).toBeLessThan(1 - amp * 0.8);
      expect(max).toBeGreaterThan(1 + amp * 0.8);
      expect(somme / 2000).toBeGreaterThan(1 - amp * 0.1);
      expect(somme / 2000).toBeLessThan(1 + amp * 0.1);
    }
  });

  it("sans aléa (publicité, réseaux sociaux, métro, agence) : exactement 1", () => {
    for (const action of ["publicite", "promotion", "reseaux_sociaux", "affichage_metro", "agence_publicite"] as const) {
      expect(aleaMarketing(action, c, tirage)).toBe(1);
      expect(fourchetteAlea(action, c)).toEqual({ min: 1, max: 1 });
    }
  });
});

describe("agence de publicité : honoraires prélevés, le reste plus efficace", () => {
  it("les honoraires sont le taux du budget, arrondi au centime", () => {
    const c = coeffs();
    const taux = v("marketing_honoraires_agence_taux");
    expect(honorairesMarketing("agence_publicite", centimes(300_001), c)).toBe(Math.round(300_001 * taux));
    expect(honorairesMarketing("publicite", centimes(300_001), c)).toBe(0);
  });

  it("l'effet porte sur le budget moins les honoraires", () => {
    const c = coeffs();
    const r = c.actions.agence_publicite;
    const montant = 400_000;
    const reste = (montant - honorairesMarketing("agence_publicite", centimes(montant), c)) / 100;
    const e = effetAction({ action: "agence_publicite", montant: centimes(montant) }, c);
    expect(e.deltaNotoriete).toBeCloseTo(r.kNotoriete * Math.log(1 + reste), 12);
    expect(e.deltaDesirabilite).toBeCloseTo(r.kDesirabilite * Math.log(1 + reste), 12);
  });

  it("à budget égal, l'agence fait mieux qu'une publicité et une image de marque à moitié chacune", () => {
    const c = coeffs();
    const agence = effetAction({ action: "agence_publicite", montant: centimes(400_000) }, c);
    const pub = effetAction({ action: "publicite", montant: centimes(200_000) }, c);
    const image = effetAction({ action: "image_marque", montant: centimes(200_000) }, c);
    expect(agence.deltaNotoriete).toBeGreaterThan(pub.deltaNotoriete);
    expect(agence.deltaDesirabilite).toBeGreaterThan(image.deltaDesirabilite);
  });
});

describe("verifierActionMarketing : montant minimum et étape", () => {
  const c = coeffs();

  it("refuse un montant sous le minimum, avec un message clair", () => {
    const min = v("marketing_montant_min_influenceur_micro");
    const r = verifierActionMarketing({ action: "influenceur_micro", montant: min - 1, etape: 1, coefficients: c });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("montant_minimum");
      expect(r.message).toContain("minimum");
      expect(r.message).toContain(`${(min / 100).toFixed(2).replace(".", ",")} €`);
    }
    expect(verifierActionMarketing({ action: "influenceur_micro", montant: min, etape: 1, coefficients: c }).ok).toBe(true);
  });

  it("refuse un montant nul, négatif ou à virgule", () => {
    for (const montant of [0, -100, 12.5]) {
      const r = verifierActionMarketing({ action: "publicite", montant, etape: 1, coefficients: c });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("montant_invalide");
    }
  });

  it("les quatre actions d'origine acceptent toujours un centime", () => {
    for (const action of ["publicite", "image_marque", "promotion", "relations_presse"] as const) {
      expect(verifierActionMarketing({ action, montant: 1, etape: 1, coefficients: c }).ok).toBe(true);
    }
  });

  it("l'affichage dans le métro attend l'étape indiquée dans les paramètres", () => {
    const etape = v("marketing_etape_min_affichage_metro");
    const montant = v("marketing_montant_min_affichage_metro");
    const r = verifierActionMarketing({ action: "affichage_metro", montant, etape: etape - 1, coefficients: c });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("etape_insuffisante");
      expect(r.message).toContain(`étape ${etape}`);
    }
    expect(verifierActionMarketing({ action: "affichage_metro", montant, etape, coefficients: c }).ok).toBe(true);
  });
});

describe("graineDepuis", () => {
  it("est déterministe, positive, et change dès qu'un morceau change", () => {
    const g = graineDepuis("societe", 3, 0);
    expect(g).toBe(graineDepuis("societe", 3, 0));
    expect(g).toBeGreaterThanOrEqual(0);
    expect(g).toBeLessThanOrEqual(0x7fffffff);
    expect(Number.isInteger(g)).toBe(true);
    expect(graineDepuis("societe", 3, 1)).not.toBe(g);
  });
});
