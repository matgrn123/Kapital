import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { centimes } from "../types/primitifs.js";
import {
  evaluerMission1,
  evaluerMission2,
  evaluerMission3,
  evaluerMission4,
  evaluerMission5,
  evaluerMissions,
  soldeA,
} from "./evaluer.js";
import { DEFINITIONS_MISSIONS } from "./definitions.js";
import { reglesMissionsDepuis } from "./metriques.js";
import type { MetriquesMissions, ReglesMissions } from "./types.js";

// Horloge réelle (décision de Mathieu du 26/11/2026) : missions comptées en jours réels.
const JOUR = 86_400_000;
/** Création de la société : jeudi 26 novembre 2026, 10 h 21 à Paris (heure du jeu). */
const CREATION = Date.UTC(2026, 10, 26, 9, 21);
const REGLES: ReglesMissions = { joursTenir: 7, joursPeriodeCroissance: 7, joursBoutique: 7 };

function metriques(partielle: Partial<MetriquesMissions>): MetriquesMissions {
  return {
    pieces_vendues_total: 0,
    marge_brute_cumul_centimes: centimes(0),
    creation_ms: CREATION,
    maintenant_ms: CREATION,
    a_eu_decouvert: false,
    ca_periode_initiale_centimes: centimes(0),
    ca_periode_max_centimes: centimes(0),
    boutiques: [],
    tresorerie: [],
    local_signe: false,
    regles: REGLES,
    ...partielle,
  };
}

describe("règles des missions : paramètres de content", () => {
  it("7 jours pour tenir, des semaines pour la croissance, 7 jours pour la boutique", () => {
    expect(reglesMissionsDepuis(chargerParametresV1())).toEqual({
      joursTenir: 7,
      joursPeriodeCroissance: 7,
      joursBoutique: 7,
    });
  });
});

describe("mission 1 — vendre 50 pièces avec marge brute positive", () => {
  it("est à faire tant qu'aucune pièce n'est vendue", () => {
    const p = evaluerMission1(metriques({}));
    expect(p.etat).toBe("a_faire");
    expect(p.cible).toBe(50);
  });

  it("passe en cours dès la première pièce vendue", () => {
    const p = evaluerMission1(metriques({ pieces_vendues_total: 1, marge_brute_cumul_centimes: centimes(100) }));
    expect(p.etat).toBe("en_cours");
  });

  it("se valide à 50 pièces avec marge positive", () => {
    const p = evaluerMission1(metriques({ pieces_vendues_total: 50, marge_brute_cumul_centimes: centimes(1000) }));
    expect(p.etat).toBe("validee");
    expect(p.actuel).toBe(50);
  });

  it("reste en cours si marge négative même avec 50 pièces", () => {
    const p = evaluerMission1(metriques({ pieces_vendues_total: 50, marge_brute_cumul_centimes: centimes(-500) }));
    expect(p.etat).toBe("en_cours");
  });
});

describe("mission 2 — tenir 7 jours sans découvert", () => {
  it("est en cours dès la création, à 0 jour sur 7", () => {
    expect(evaluerMission2(metriques({}))).toEqual({ id: "mission2", etat: "en_cours", actuel: 0, cible: 7 });
  });

  it("compte les jours entiers écoulés depuis la création", () => {
    const p = evaluerMission2(metriques({ maintenant_ms: CREATION + 4 * JOUR + JOUR / 2 }));
    expect(p).toMatchObject({ etat: "en_cours", actuel: 4, cible: 7 });
  });

  it("se valide au bout de 7 jours sans découvert", () => {
    expect(evaluerMission2(metriques({ maintenant_ms: CREATION + 7 * JOUR }))).toEqual({
      id: "mission2",
      etat: "validee",
      actuel: 7,
      cible: 7,
    });
    expect(evaluerMission2(metriques({ maintenant_ms: CREATION + 7 * JOUR - 1 })).etat).toBe("en_cours");
  });

  it("retombe à faire si un découvert a eu lieu", () => {
    const p = evaluerMission2(metriques({ maintenant_ms: CREATION + 30 * JOUR, a_eu_decouvert: true }));
    expect(p).toMatchObject({ etat: "a_faire", actuel: 0 });
  });

  it("la durée vient des règles (paramètre), pas d'une constante", () => {
    const p = evaluerMission2(metriques({ maintenant_ms: CREATION + 3 * JOUR, regles: { ...REGLES, joursTenir: 3 } }));
    expect(p).toMatchObject({ etat: "validee", cible: 3 });
  });
});

describe("mission 3 — doubler le CA d'une semaine sans découvert", () => {
  it("est à faire tant qu'aucune semaine de ventes n'est établie", () => {
    const p = evaluerMission3(metriques({}));
    expect(p.etat).toBe("a_faire");
    expect(p.cible).toBe(0);
  });

  it("passe en cours avec un CA de première semaine non nul", () => {
    const p = evaluerMission3(
      metriques({ ca_periode_initiale_centimes: centimes(100_000), ca_periode_max_centimes: centimes(120_000) }),
    );
    expect(p.etat).toBe("en_cours");
    expect(p.cible).toBe(200_000);
  });

  it("se valide quand une semaine atteint 2× la première, sans découvert", () => {
    const p = evaluerMission3(
      metriques({ ca_periode_initiale_centimes: centimes(100_000), ca_periode_max_centimes: centimes(210_000) }),
    );
    expect(p.etat).toBe("validee");
  });

  it("ne se valide pas si un découvert a eu lieu, même avec CA doublé", () => {
    const p = evaluerMission3(
      metriques({
        ca_periode_initiale_centimes: centimes(100_000),
        ca_periode_max_centimes: centimes(300_000),
        a_eu_decouvert: true,
      }),
    );
    expect(p.etat).toBe("en_cours");
  });
});

describe("evaluerMissions", () => {
  it("retourne les cinq missions dans l'ordre 1 à 5", () => {
    expect(evaluerMissions(metriques({})).map((r) => r.id)).toEqual([
      "mission1",
      "mission2",
      "mission3",
      "mission4",
      "mission5",
    ]);
  });

  it("les cinq missions se valident ensemble dans un scénario nominal (critère CDC et AE-11)", () => {
    const resultats = evaluerMissions(
      metriques({
        pieces_vendues_total: 60,
        marge_brute_cumul_centimes: centimes(50_000),
        maintenant_ms: CREATION + 40 * JOUR,
        ca_periode_initiale_centimes: centimes(200_000),
        ca_periode_max_centimes: centimes(500_000),
        boutiques: [{ signee_le_ms: CREATION + 20 * JOUR }],
        tresorerie: [{ instant_ms: CREATION, solde_centimes: centimes(5_000_000) }],
        local_signe: true,
      }),
    );
    expect(resultats).toHaveLength(5);
    expect(resultats.every((r) => r.etat === "validee")).toBe(true);
  });
});

const point = (jours: number, c: number) => ({ instant_ms: CREATION + jours * JOUR, solde_centimes: centimes(c) });

describe("solde de trésorerie à un instant", () => {
  it("garde le dernier solde connu ; 0 avant toute écriture", () => {
    const s = [point(2, 100), point(5, -50)];
    expect(soldeA(s, CREATION + 1 * JOUR)).toBe(0);
    expect(soldeA(s, CREATION + 2 * JOUR)).toBe(100);
    expect(soldeA(s, CREATION + 4 * JOUR)).toBe(100);
    expect(soldeA(s, CREATION + 5 * JOUR)).toBe(-50);
    expect(soldeA(s, CREATION + 9 * JOUR)).toBe(-50);
  });
});

describe("mission 4 — ouvrir ma boutique sans découvert pendant les 7 jours qui suivent la signature", () => {
  const SIGNATURE = CREATION + 20 * JOUR;
  const BOUTIQUE = { signee_le_ms: SIGNATURE };

  it("est à faire sans boutique", () => {
    expect(evaluerMission4(metriques({ maintenant_ms: CREATION + 30 * JOUR }))).toEqual({
      id: "mission4",
      etat: "a_faire",
      actuel: 0,
      cible: 0,
    });
  });

  it("est en cours pendant les 7 jours (travaux puis premières ventes), en jours écoulés", () => {
    const m = { boutiques: [BOUTIQUE], tresorerie: [point(0, 3_000_000)] };
    expect(evaluerMission4(metriques({ ...m, maintenant_ms: SIGNATURE }))).toMatchObject({ etat: "en_cours", actuel: 0, cible: 7 });
    expect(evaluerMission4(metriques({ ...m, maintenant_ms: SIGNATURE + 3 * JOUR }))).toMatchObject({
      etat: "en_cours",
      actuel: 3,
      cible: 7,
    });
  });

  it("se valide 7 jours après la signature sans découvert", () => {
    const p = evaluerMission4(
      metriques({
        boutiques: [BOUTIQUE],
        tresorerie: [point(0, 3_000_000), point(20, 400_000), point(25, 0)],
        maintenant_ms: SIGNATURE + 7 * JOUR,
      }),
    );
    expect(p).toEqual({ id: "mission4", etat: "validee", actuel: 7, cible: 7 });
  });

  it("est ratée si la trésorerie passe sous zéro pendant la fenêtre, même un instant", () => {
    const p = evaluerMission4(
      metriques({
        boutiques: [BOUTIQUE],
        tresorerie: [point(0, 3_000_000), point(20, -1), point(21, 500_000)],
        maintenant_ms: SIGNATURE + 10 * JOUR,
      }),
    );
    expect(p.etat).toBe("a_faire");
  });

  it("est ratée si la trésorerie était déjà sous zéro à la signature", () => {
    const p = evaluerMission4(
      metriques({
        boutiques: [BOUTIQUE],
        tresorerie: [point(0, 3_000_000), point(19, -10)],
        maintenant_ms: SIGNATURE + 10 * JOUR,
      }),
    );
    expect(p.etat).toBe("a_faire");
  });

  it("ignore un découvert avant la signature (remonté depuis) ou après les 7 jours", () => {
    const p = evaluerMission4(
      metriques({
        boutiques: [BOUTIQUE],
        tresorerie: [point(3, -10_000), point(4, 3_000_000), point(28, -5)],
        maintenant_ms: SIGNATURE + 10 * JOUR,
        a_eu_decouvert: true,
      }),
    );
    expect(p.etat).toBe("validee");
  });

  it("une boutique réussie suffit quand il y en a plusieurs", () => {
    const p = evaluerMission4(
      metriques({
        boutiques: [BOUTIQUE, { signee_le_ms: CREATION + 30 * JOUR }],
        tresorerie: [point(0, 3_000_000), point(21, -1), point(30, 900_000)],
        maintenant_ms: CREATION + 40 * JOUR,
      }),
    );
    expect(p.etat).toBe("validee");
  });
});

describe("mission 5 — louer ou acheter", () => {
  it("à faire tant qu'aucun local n'est loué ni acheté", () => {
    expect(evaluerMission5(metriques({}))).toEqual({ id: "mission5", etat: "a_faire", actuel: 0, cible: 1 });
  });
  it("validée dès qu'un bail est signé ou un local acheté", () => {
    expect(evaluerMission5(metriques({ local_signe: true }))).toEqual({ id: "mission5", etat: "validee", actuel: 1, cible: 1 });
  });
});

describe("définitions des missions", () => {
  it("cinq missions numérotées dans l'ordre, chacune avec sa notion", () => {
    expect(DEFINITIONS_MISSIONS.map((d) => d.id)).toEqual(["mission1", "mission2", "mission3", "mission4", "mission5"]);
    expect(DEFINITIONS_MISSIONS.map((d) => d.numero)).toEqual([1, 2, 3, 4, 5]);
    for (const d of DEFINITIONS_MISSIONS) expect(d.explication.length).toBeGreaterThan(50);
  });

  it("les textes annoncent les durées des paramètres (garde-fou si un paramètre change)", () => {
    const r = reglesMissionsDepuis(chargerParametresV1());
    const def = (id: string) => DEFINITIONS_MISSIONS.find((d) => d.id === id)!;
    expect(def("mission2").titre).toBe(`Tenir ${r.joursTenir} jours`);
    expect(def("mission2").objectif).toContain(`${r.joursTenir} premiers jours`);
    expect(r.joursPeriodeCroissance).toBe(7); // le texte de la mission 3 parle de « semaine »
    expect(def("mission3").objectif).toContain("semaine");
    expect(def("mission4").objectif).toContain(`${r.joursBoutique} jours`);
  });
});
