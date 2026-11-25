import { describe, expect, it } from "vitest";
import { centimes } from "../types/primitifs.js";
import {
  evaluerMission1,
  evaluerMission2,
  evaluerMission3,
  evaluerMission4,
  evaluerMission5,
  evaluerMissions,
  soldeFinDeMois,
} from "./evaluer.js";
import { DEFINITIONS_MISSIONS } from "./definitions.js";
import type { MetriquesMissions } from "./types.js";

function metriques(partielle: Partial<MetriquesMissions>): MetriquesMissions {
  return {
    pieces_vendues_total: 0,
    marge_brute_cumul_centimes: centimes(0),
    mois_jeu_courant: 0,
    mois_jeu_creation: 0,
    a_eu_decouvert: false,
    ca_mois_initial_centimes: centimes(0),
    ca_mois_max_centimes: centimes(0),
    boutiques: [],
    tresorerie_fin_mois: [],
    local_signe: false,
    ...partielle,
  };
}

describe("mission 1 — vendre 50 pièces avec marge brute positive", () => {
  it("est à faire tant qu'aucune pièce n'est vendue", () => {
    const p = evaluerMission1(metriques({}));
    expect(p.etat).toBe("a_faire");
    expect(p.cible).toBe(50);
  });

  it("passe en cours dès la première pièce vendue", () => {
    const p = evaluerMission1(
      metriques({
        pieces_vendues_total: 1,
        marge_brute_cumul_centimes: centimes(100),
      }),
    );
    expect(p.etat).toBe("en_cours");
  });

  it("se valide à 50 pièces avec marge positive", () => {
    const p = evaluerMission1(
      metriques({
        pieces_vendues_total: 50,
        marge_brute_cumul_centimes: centimes(1000),
      }),
    );
    expect(p.etat).toBe("validee");
    expect(p.actuel).toBe(50);
  });

  it("reste en cours si marge négative même avec 50 pièces", () => {
    const p = evaluerMission1(
      metriques({
        pieces_vendues_total: 50,
        marge_brute_cumul_centimes: centimes(-500),
      }),
    );
    expect(p.etat).toBe("en_cours");
  });
});

describe("mission 2 — tenir 6 mois sans découvert", () => {
  it("est à faire au mois 0", () => {
    const p = evaluerMission2(metriques({}));
    expect(p.etat).toBe("a_faire");
  });

  it("reste en cours tant que 6 mois ne sont pas écoulés", () => {
    const p = evaluerMission2(
      metriques({ mois_jeu_courant: 4, mois_jeu_creation: 0 }),
    );
    expect(p.etat).toBe("en_cours");
    expect(p.actuel).toBe(4);
  });

  it("se valide à 6 mois sans découvert", () => {
    const p = evaluerMission2(
      metriques({
        mois_jeu_courant: 6,
        mois_jeu_creation: 0,
        a_eu_decouvert: false,
      }),
    );
    expect(p.etat).toBe("validee");
    expect(p.actuel).toBe(6);
  });

  it("retombe à faire si un découvert a eu lieu", () => {
    const p = evaluerMission2(
      metriques({
        mois_jeu_courant: 8,
        mois_jeu_creation: 0,
        a_eu_decouvert: true,
      }),
    );
    expect(p.etat).toBe("a_faire");
  });
});

describe("mission 3 — doubler le CA sans découvert", () => {
  it("est à faire tant qu'aucun CA de référence n'est établi", () => {
    const p = evaluerMission3(metriques({}));
    expect(p.etat).toBe("a_faire");
    expect(p.cible).toBe(0);
  });

  it("passe en cours avec un CA initial non nul", () => {
    const p = evaluerMission3(
      metriques({
        ca_mois_initial_centimes: centimes(100_000),
        ca_mois_max_centimes: centimes(120_000),
      }),
    );
    expect(p.etat).toBe("en_cours");
    expect(p.cible).toBe(200_000);
  });

  it("se valide quand le CA max atteint 2× le CA initial sans découvert", () => {
    const p = evaluerMission3(
      metriques({
        ca_mois_initial_centimes: centimes(100_000),
        ca_mois_max_centimes: centimes(210_000),
        a_eu_decouvert: false,
      }),
    );
    expect(p.etat).toBe("validee");
  });

  it("ne se valide pas si un découvert a eu lieu, même avec CA doublé", () => {
    const p = evaluerMission3(
      metriques({
        ca_mois_initial_centimes: centimes(100_000),
        ca_mois_max_centimes: centimes(300_000),
        a_eu_decouvert: true,
      }),
    );
    expect(p.etat).toBe("en_cours");
  });
});

describe("evaluerMissions", () => {
  it("retourne les cinq missions dans l'ordre 1 à 5", () => {
    const resultats = evaluerMissions(metriques({}));
    expect(resultats.map((r) => r.id)).toEqual([
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
        mois_jeu_courant: 12,
        mois_jeu_creation: 0,
        a_eu_decouvert: false,
        ca_mois_initial_centimes: centimes(200_000),
        ca_mois_max_centimes: centimes(500_000),
        boutiques: [{ mois_signature: 8, mois_ouverture: 9 }],
        tresorerie_fin_mois: [{ mois: 0, solde_centimes: centimes(5_000_000) }],
        local_signe: true,
      }),
    );
    expect(resultats).toHaveLength(5);
    expect(resultats.every((r) => r.etat === "validee")).toBe(true);
  });
});

const solde = (mois: number, c: number) => ({ mois, solde_centimes: centimes(c) });

describe("solde de trésorerie en fin de mois", () => {
  it("garde le dernier solde connu ; 0 avant toute écriture", () => {
    const s = [solde(2, 100), solde(5, -50)];
    expect(soldeFinDeMois(s, 1)).toBe(0);
    expect(soldeFinDeMois(s, 2)).toBe(100);
    expect(soldeFinDeMois(s, 4)).toBe(100);
    expect(soldeFinDeMois(s, 5)).toBe(-50);
    expect(soldeFinDeMois(s, 9)).toBe(-50);
  });
});

describe("mission 4 — ouvrir ma boutique sans découvert", () => {
  const BOUTIQUE = { mois_signature: 20, mois_ouverture: 21 };

  it("est à faire sans boutique", () => {
    expect(evaluerMission4(metriques({ mois_jeu_courant: 30 }))).toEqual({ id: "mission4", etat: "a_faire", actuel: 0, cible: 0 });
  });

  it("est en cours pendant les travaux et le premier mois d'ouverture", () => {
    const m = { boutiques: [BOUTIQUE], tresorerie_fin_mois: [solde(0, 3_000_000)] };
    expect(evaluerMission4(metriques({ ...m, mois_jeu_courant: 20 }))).toMatchObject({ etat: "en_cours", actuel: 0, cible: 2 });
    expect(evaluerMission4(metriques({ ...m, mois_jeu_courant: 21 }))).toMatchObject({ etat: "en_cours", actuel: 1, cible: 2 });
  });

  it("se valide quand le mois d'ouverture est clos sans découvert", () => {
    const p = evaluerMission4(
      metriques({
        boutiques: [BOUTIQUE],
        tresorerie_fin_mois: [solde(0, 3_000_000), solde(20, 400_000), solde(21, 0)],
        mois_jeu_courant: 22,
      }),
    );
    expect(p).toEqual({ id: "mission4", etat: "validee", actuel: 2, cible: 2 });
  });

  it("est ratée si la trésorerie passe sous zéro à la fin d'un mois de la fenêtre", () => {
    const p = evaluerMission4(
      metriques({
        boutiques: [BOUTIQUE],
        tresorerie_fin_mois: [solde(0, 3_000_000), solde(20, -1), solde(21, 500_000)],
        mois_jeu_courant: 25,
      }),
    );
    expect(p.etat).toBe("a_faire");
  });

  it("ignore un découvert avant la signature ou après le mois d'ouverture", () => {
    const p = evaluerMission4(
      metriques({
        boutiques: [BOUTIQUE],
        tresorerie_fin_mois: [solde(3, -10_000), solde(4, 3_000_000), solde(22, -5)],
        mois_jeu_courant: 25,
        a_eu_decouvert: true,
      }),
    );
    expect(p.etat).toBe("validee");
  });

  it("une boutique réussie suffit quand il y en a plusieurs", () => {
    const p = evaluerMission4(
      metriques({
        boutiques: [BOUTIQUE, { mois_signature: 30, mois_ouverture: 31 }],
        tresorerie_fin_mois: [solde(0, 3_000_000), solde(21, -1), solde(30, 900_000)],
        mois_jeu_courant: 33,
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
});
