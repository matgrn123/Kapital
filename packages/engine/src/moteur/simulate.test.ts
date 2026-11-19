import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import type { DecisionsEntreprise } from "../types/decision.js";
import type { Entreprise } from "../types/entreprise.js";
import type { MarketInputs } from "../types/marketInputs.js";
import type { Monde } from "../types/monde.js";
import {
  centimes,
  graine,
  idEntreprise,
  moisJeu,
  type Graine,
} from "../types/primitifs.js";
import { creerRng } from "./rng.js";
import { simulateMonth } from "./simulate.js";

function entrepriseTest(nom: string, noto = 40, desi = 40): Entreprise {
  return {
    id: idEntreprise(`ent_${nom}`),
    nom,
    gamme: "milieu",
    etape: 0,
    proprietaire: { type: "joueur", idProfil: `profil_${nom}` },
    statut: "active",
    tresorerie: centimes(2_000_000),
    stocksMatiere: [],
    stocksFinis: [],
    salaries: [],
    atelier: null,
    marque: { notoriete: noto, desirabilite: desi },
    prets: [],
    catalogue: [],
  };
}

function mondeTest(): Monde {
  return {
    moisCourant: moisJeu(0),
    entreprises: [entrepriseTest("A"), entrepriseTest("B", 30, 30)],
    prixMatieres: [],
    franges: [],
    evenements: [],
  };
}

function inputsTest(): MarketInputs {
  return {
    mois: moisJeu(0),
    smicHoraireBrut: centimes(1231),
    tauxEstrAnnuel: 0.035,
    prixElectriciteParKwh: centimes(16),
    coursCotonParKg: centimes(180),
    inflationMensuelle: 0.002,
  };
}

describe("creerRng — PRNG déterministe", () => {
  it("même graine produit la même séquence", () => {
    const r1 = creerRng(graine(42));
    const r2 = creerRng(graine(42));
    for (let i = 0; i < 100; i++) {
      expect(r1()).toBe(r2());
    }
  });

  it("graines différentes produisent des séquences différentes", () => {
    const r1 = creerRng(graine(1));
    const r2 = creerRng(graine(2));
    const s1: number[] = [];
    const s2: number[] = [];
    for (let i = 0; i < 10; i++) {
      s1.push(r1());
      s2.push(r2());
    }
    expect(s1).not.toEqual(s2);
  });

  it("valeurs entre 0 et 1", () => {
    const r = creerRng(graine(123));
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("simulateMonth — critère T13 : déterminisme", () => {
  function executer(gr: Graine, decisions: readonly DecisionsEntreprise[] = []) {
    return simulateMonth({
      monde: mondeTest(),
      decisions,
      marketInputs: inputsTest(),
      params: chargerParametresV1(),
      graine: gr,
    });
  }

  it("deux appels avec mêmes entrées rendent exactement le même résultat", () => {
    const r1 = executer(graine(42));
    const r2 = executer(graine(42));
    expect(r1).toEqual(r2);
  });

  it("deux appels avec des décisions identiques rendent le même résultat", () => {
    const decisions: readonly DecisionsEntreprise[] = [
      {
        entreprise: idEntreprise("ent_A"),
        decisions: [
          {
            type: "action_marketing",
            action: "promotion",
            montant: centimes(100_000),
          },
        ],
      },
    ];
    const r1 = executer(graine(7), decisions);
    const r2 = executer(graine(7), decisions);
    expect(r1).toEqual(r2);
  });

  it("le mois avance d'exactement un pas", () => {
    const r = executer(graine(1));
    expect(r.nouveauMonde.moisCourant).toBe(1);
  });

  it("le nombre d'entreprises est préservé", () => {
    const r = executer(graine(1));
    expect(r.nouveauMonde.entreprises).toHaveLength(2);
  });
});

describe("simulateMonth — marque", () => {
  it("entreprise sans action marketing : notoriété décroît de 5 %", () => {
    const r = simulateMonth({
      monde: mondeTest(),
      decisions: [],
      marketInputs: inputsTest(),
      params: chargerParametresV1(),
      graine: graine(1),
    });
    const entA = r.nouveauMonde.entreprises.find((e) => e.nom === "A")!;
    expect(entA.marque.notoriete).toBeCloseTo(40 * 0.95, 5);
    expect(entA.marque.desirabilite).toBeCloseTo(40 * 0.98, 5);
  });

  it("entreprise avec promotion : notoriété monte, désirabilité descend", () => {
    const r = simulateMonth({
      monde: mondeTest(),
      decisions: [
        {
          entreprise: idEntreprise("ent_A"),
          decisions: [
            {
              type: "action_marketing",
              action: "promotion",
              montant: centimes(500_000),
            },
          ],
        },
      ],
      marketInputs: inputsTest(),
      params: chargerParametresV1(),
      graine: graine(1),
    });
    const entA = r.nouveauMonde.entreprises.find((e) => e.nom === "A")!;
    expect(entA.marque.notoriete).toBeGreaterThan(40);
    expect(entA.marque.desirabilite).toBeLessThan(40);
  });

  it("chaque entreprise a une explication par jauge", () => {
    const r = simulateMonth({
      monde: mondeTest(),
      decisions: [],
      marketInputs: inputsTest(),
      params: chargerParametresV1(),
      graine: graine(1),
    });
    for (const res of r.resultatsParEntreprise) {
      expect(res.explications.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("simulateMonth — pureté", () => {
  it("ne modifie pas le monde d'origine", () => {
    const monde = mondeTest();
    const notoAvant = monde.entreprises[0]!.marque.notoriete;
    simulateMonth({
      monde,
      decisions: [],
      marketInputs: inputsTest(),
      params: chargerParametresV1(),
      graine: graine(1),
    });
    expect(monde.entreprises[0]!.marque.notoriete).toBe(notoAvant);
  });

  it("deux pas successifs : rejouables avec les mêmes paramètres", () => {
    const params = chargerParametresV1();
    const r1a = simulateMonth({
      monde: mondeTest(),
      decisions: [],
      marketInputs: inputsTest(),
      params,
      graine: graine(99),
    });
    const r2a = simulateMonth({
      monde: r1a.nouveauMonde,
      decisions: [],
      marketInputs: inputsTest(),
      params,
      graine: graine(99),
    });
    const r1b = simulateMonth({
      monde: mondeTest(),
      decisions: [],
      marketInputs: inputsTest(),
      params,
      graine: graine(99),
    });
    const r2b = simulateMonth({
      monde: r1b.nouveauMonde,
      decisions: [],
      marketInputs: inputsTest(),
      params,
      graine: graine(99),
    });
    expect(r2a).toEqual(r2b);
    expect(r2a.nouveauMonde.moisCourant).toBe(2);
  });
});
