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

describe("missions de l'étape 3 (AE-11)", () => {
  const e = (mois: number, compte: string, sens: "debit" | "credit", montant: number, ecriture_id = "x") => ({
    ecriture_id,
    mois_jeu: mois,
    libelle: "test",
    compte,
    sens,
    montant_centimes: montant,
  });

  it("calcule le solde de trésorerie à la fin de chaque mois où il bouge", () => {
    const m = calculerMetriques([e(0, "512", "debit", 1000), e(2, "512", "credit", 300), e(2, "512", "credit", 900)], 0, 5);
    expect(m.tresorerie_fin_mois).toEqual([
      { mois: 0, solde_centimes: 1000 },
      { mois: 2, solde_centimes: -200 },
    ]);
  });

  it("« Ouvrir ma boutique sans découvert » se valide avec la boutique lue en base, sans découvert", () => {
    const ecritures = [
      e(0, "512", "debit", 5_000_000, "apport_initial"),
      e(20, "512", "credit", 2_500_000, "boutique_depot_1"),
      e(21, "512", "credit", 300_000, "boutique_loyer_21_1"),
    ];
    const m = calculerMetriques(ecritures, 0, 22, { boutiques: [{ mois_signature: 20, mois_ouverture: 21 }] });
    expect(evaluerMissions(m).find((p) => p.id === "mission4")!.etat).toBe("validee");
  });

  it("« Louer ou acheter » se valide par l'écriture de signature du bail ou d'achat du local", () => {
    expect(calculerMetriques([e(3, "275", "debit", 100, "bail_signature_abc")], 0, 4).local_signe).toBe(true);
    expect(calculerMetriques([e(3, "213", "debit", 100, "achat_local_abc")], 0, 4).local_signe).toBe(true);
    expect(calculerMetriques([e(3, "275", "debit", 100, "boutique_depot_abc")], 0, 4).local_signe).toBe(false);
    expect(calculerMetriques([], 0, 4, { localEnregistre: true }).local_signe).toBe(true);
  });
});
