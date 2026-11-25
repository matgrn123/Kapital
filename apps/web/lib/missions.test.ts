import { describe, expect, it } from "vitest";
import { chargerParametresV1 } from "@kapital/content";
import { configTempsDepuis, evaluerMissions } from "@kapital/engine";
import { calculerMetriques, moisDeCreation } from "./missions";

const PARAMS = chargerParametresV1();
const msParMois = configTempsDepuis(PARAMS).minutesReellesParMoisJeu * 60_000;
const DEBUT = "2026-11-15T00:00:00.000Z";
const instant = (mois: number) => new Date(Date.parse(DEBUT) + mois * msParMois).toISOString();

describe("moisDeCreation", () => {
  it("donne le mois de jeu où la société a été créée", () => {
    expect(moisDeCreation(PARAMS, DEBUT, instant(10.5))).toBe(10);
    expect(moisDeCreation(PARAMS, DEBUT, DEBUT)).toBe(0);
  });
  it("vaut 0 sans date de création ou de début du monde", () => {
    expect(moisDeCreation(PARAMS, null, instant(3))).toBe(0);
    expect(moisDeCreation(PARAMS, DEBUT, null)).toBe(0);
  });
});

describe("mission « Tenir six mois »", () => {
  it("n'est pas réussie pour une société créée au mois 10 quand le monde est au mois 10", () => {
    const m = calculerMetriques([], moisDeCreation(PARAMS, DEBUT, instant(10.5)), 10);
    const mission2 = evaluerMissions(m).find((p) => p.id === "mission2")!;
    expect(mission2.etat).not.toBe("validee");
    expect(mission2.actuel).toBe(0);
  });
  it("est réussie six mois après la création, sans découvert", () => {
    const m = calculerMetriques([], 10, 16);
    expect(evaluerMissions(m).find((p) => p.id === "mission2")!.etat).toBe("validee");
  });
});
