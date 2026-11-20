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
  instantJeu,
  MINUTES_PAR_MOIS_JEU,
  moisJeu,
  type Graine,
} from "../types/primitifs.js";
import { creerRng } from "./rng.js";
import { simulateMonth, simulerDepuis } from "./simulate.js";

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
    expect(entA.marque.notoriete).toBeCloseTo(40 * Math.exp(-0.05), 5);
    expect(entA.marque.desirabilite).toBeCloseTo(40 * Math.exp(-0.02), 5);
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

describe("simulerDepuis — nouvelle API, intervalles arbitraires", () => {
  function executerIntervalle(minutesReelles: number) {
    return simulerDepuis({
      monde: mondeTest(),
      decisions: [],
      marketInputs: inputsTest(),
      params: chargerParametresV1(),
      instantDebut: instantJeu(0),
      instantFin: instantJeu(minutesReelles),
      graine: graine(42),
    });
  }

  it("avance d'une heure réelle (≈ 1/24 mois) : décroissance proportionnelle", () => {
    const r = executerIntervalle(60);
    const entA = r.nouveauMonde.entreprises.find((e) => e.nom === "A")!;
    const attendu = 40 * Math.exp(-0.05 * (60 / MINUTES_PAR_MOIS_JEU));
    expect(entA.marque.notoriete).toBeCloseTo(attendu, 5);
  });

  it("avance de 30 min = cadence de rafraîchissement du marché", () => {
    const r = executerIntervalle(30);
    expect(r.nouveauMonde.moisCourant).toBe(0);
  });

  it("avance d'un mois complet : équivalent à simulateMonth sur l'entrée", () => {
    const parSimuler = executerIntervalle(MINUTES_PAR_MOIS_JEU);
    const parWrapper = simulateMonth({
      monde: mondeTest(),
      decisions: [],
      marketInputs: inputsTest(),
      params: chargerParametresV1(),
      graine: graine(42),
    });
    const entA1 = parSimuler.nouveauMonde.entreprises.find((e) => e.nom === "A")!;
    const entA2 = parWrapper.nouveauMonde.entreprises.find((e) => e.nom === "A")!;
    expect(entA1.marque).toEqual(entA2.marque);
  });

  it("avance de 3 mois : noto × exp(-0,05 × 3)", () => {
    const r = executerIntervalle(3 * MINUTES_PAR_MOIS_JEU);
    const entA = r.nouveauMonde.entreprises.find((e) => e.nom === "A")!;
    expect(entA.marque.notoriete).toBeCloseTo(40 * Math.exp(-0.15), 5);
    expect(r.nouveauMonde.moisCourant).toBe(3);
  });

  it("déterminisme sur un intervalle : deux appels identiques → même résultat", () => {
    const r1 = executerIntervalle(90);
    const r2 = executerIntervalle(90);
    expect(r1).toEqual(r2);
  });

  it("additivité partielle : avance(0 → 2h) proche de avance(0 → 1h) puis avance(1h → 2h)", () => {
    const params = chargerParametresV1();
    const direct = simulerDepuis({
      monde: mondeTest(),
      decisions: [],
      marketInputs: inputsTest(),
      params,
      instantDebut: instantJeu(0),
      instantFin: instantJeu(120),
      graine: graine(1),
    });
    const pas1 = simulerDepuis({
      monde: mondeTest(),
      decisions: [],
      marketInputs: inputsTest(),
      params,
      instantDebut: instantJeu(0),
      instantFin: instantJeu(60),
      graine: graine(1),
    });
    const pas2 = simulerDepuis({
      monde: pas1.nouveauMonde,
      decisions: [],
      marketInputs: inputsTest(),
      params,
      instantDebut: instantJeu(60),
      instantFin: instantJeu(120),
      graine: graine(1),
    });
    const notoDirect = direct.nouveauMonde.entreprises.find((e) => e.nom === "A")!.marque.notoriete;
    const notoPas = pas2.nouveauMonde.entreprises.find((e) => e.nom === "A")!.marque.notoriete;
    expect(notoDirect).toBeCloseTo(notoPas, 10);
  });

  it("refuse un intervalle inversé (fin < debut)", () => {
    expect(() =>
      simulerDepuis({
        monde: mondeTest(),
        decisions: [],
        marketInputs: inputsTest(),
        params: chargerParametresV1(),
        instantDebut: instantJeu(100),
        instantFin: instantJeu(50),
        graine: graine(1),
      }),
    ).toThrow();
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
