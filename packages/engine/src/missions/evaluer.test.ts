import { describe, expect, it } from "vitest";
import { centimes } from "../types/primitifs.js";
import {
  evaluerMission1,
  evaluerMission2,
  evaluerMission3,
  evaluerMissions,
} from "./evaluer.js";
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
  it("retourne les trois missions dans l'ordre 1, 2, 3", () => {
    const resultats = evaluerMissions(metriques({}));
    expect(resultats.map((r) => r.id)).toEqual([
      "mission1",
      "mission2",
      "mission3",
    ]);
  });

  it("les trois missions se valident ensemble dans un scénario nominal (critère CDC)", () => {
    const resultats = evaluerMissions(
      metriques({
        pieces_vendues_total: 60,
        marge_brute_cumul_centimes: centimes(50_000),
        mois_jeu_courant: 12,
        mois_jeu_creation: 0,
        a_eu_decouvert: false,
        ca_mois_initial_centimes: centimes(200_000),
        ca_mois_max_centimes: centimes(500_000),
      }),
    );
    expect(resultats.every((r) => r.etat === "validee")).toBe(true);
  });
});
