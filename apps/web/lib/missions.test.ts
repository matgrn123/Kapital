import { describe, expect, it } from "vitest";
import { chargerParametresV1 } from "@kapital/content";
import { evaluerMissions, indexDuMois } from "@kapital/engine";
import { calculerMetriques, moisDeCreation } from "./missions";

const PARAMS = chargerParametresV1();
// Horloge réelle : l'origine de l'horloge (worlds.debut_reel) est le 1er janvier 1970.
const DEBUT = "1970-01-01T00:00:00.000Z";
const CREATION = "2026-11-26T09:21:00.000Z"; // jeudi 26 novembre 2026, 10 h 21 à Paris
const NOVEMBRE_2026 = indexDuMois(2026, 11);

describe("moisDeCreation", () => {
  it("donne le mois calendaire où la société a été créée", () => {
    expect(moisDeCreation(PARAMS, DEBUT, CREATION)).toBe(NOVEMBRE_2026);
    expect(moisDeCreation(PARAMS, DEBUT, "2026-11-30T23:00:00.000Z")).toBe(NOVEMBRE_2026 + 1); // 1er déc. 0 h à Paris
  });
  it("vaut 0 sans date de création ou de début du monde", () => {
    expect(moisDeCreation(PARAMS, null, CREATION)).toBe(0);
    expect(moisDeCreation(PARAMS, DEBUT, null)).toBe(0);
  });
});

describe("mission « Tenir six mois »", () => {
  it("n'est pas réussie pour une société créée le mois même où le monde se trouve", () => {
    const m = calculerMetriques([], moisDeCreation(PARAMS, DEBUT, CREATION), NOVEMBRE_2026);
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
