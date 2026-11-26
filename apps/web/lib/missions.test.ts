import { describe, expect, it } from "vitest";
import { chargerParametresV1 } from "@kapital/content";
import { evaluerMissions, indexDuMois } from "@kapital/engine";
import { heureDuJeuMs, metriquesDepuisLignesDb, texteAvancement, type LigneLedgerDb } from "./missions";

const PARAMS = chargerParametresV1();
// Horloge réelle : l'origine de l'horloge (worlds.debut_reel) est le 1er janvier 1970.
const DEBUT = "1970-01-01T00:00:00.000Z";
const CREATION = "2026-11-26T09:21:00.000Z"; // jeudi 26 novembre 2026, 10 h 21 à Paris
const CREATION_MS = Date.parse(CREATION);
const JOUR = 86_400_000;
const NOVEMBRE_2026 = indexDuMois(2026, 11);

const e = (
  jours: number,
  compte: string,
  sens: "debit" | "credit",
  montant: number,
  ecriture_id = "x",
  libelle = "test",
): LigneLedgerDb => ({
  ecriture_id,
  mois_jeu: NOVEMBRE_2026,
  libelle,
  compte,
  sens,
  montant_centimes: montant,
  cree_le: new Date(CREATION_MS + jours * JOUR).toISOString(),
});

function missions(lignes: LigneLedgerDb[], maintenantJours: number, autres: Partial<Parameters<typeof metriquesDepuisLignesDb>[0]> = {}) {
  return evaluerMissions(
    metriquesDepuisLignesDb({
      params: PARAMS,
      lignes,
      debutReelIso: DEBUT,
      creeLeSociete: CREATION,
      maintenantMs: CREATION_MS + maintenantJours * JOUR,
      ...autres,
    }),
  );
}
const mission = (ps: ReturnType<typeof missions>, id: string) => ps.find((p) => p.id === id)!;

describe("heureDuJeuMs", () => {
  it("instant réel moins l'origine de l'horloge (worlds.debut_reel)", () => {
    expect(heureDuJeuMs(CREATION, Date.parse(DEBUT))).toBe(CREATION_MS);
    expect(heureDuJeuMs(CREATION, CREATION_MS - JOUR)).toBe(JOUR);
  });
  it("null pour une date absente ou illisible", () => {
    expect(heureDuJeuMs(null, 0)).toBeNull();
    expect(heureDuJeuMs("pas une date", 0)).toBeNull();
  });
});

describe("mission « Tenir 7 jours »", () => {
  const apport = e(0, "512", "debit", 5_000_000, "apport_initial");

  it("n'est pas réussie le jour de la création", () => {
    const m2 = mission(missions([apport], 0.5), "mission2");
    expect(m2).toMatchObject({ etat: "en_cours", actuel: 0, cible: 7 });
  });

  it("est réussie 7 jours après la création, sans découvert", () => {
    expect(mission(missions([apport], 7), "mission2").etat).toBe("validee");
  });

  it("est ratée par un découvert passager, même comblé dans le mois", () => {
    const lignes = [apport, e(2, "512", "credit", 6_000_000), e(3, "512", "debit", 2_000_000)];
    expect(mission(missions(lignes, 8), "mission2").etat).toBe("a_faire");
  });

  it("l'outil « avancer le temps » (debut_reel reculé) avance aussi la création : les jours restent réels", () => {
    const recule = new Date(Date.parse(DEBUT) - 30 * JOUR).toISOString();
    expect(mission(missions([apport], 3, { debutReelIso: recule }), "mission2").actuel).toBe(3);
  });
});

describe("mission « Survivre à la croissance » : semaine contre semaine", () => {
  const vente = (jours: number, montant: number) => e(jours, "707", "credit", montant, "v", "Vente directe 1 × t-shirt");
  it("se valide quand une semaine fait le double de la première semaine de ventes", () => {
    const lignes = [e(0, "512", "debit", 5_000_000), vente(1, 10_000), vente(9, 15_000), vente(15, 20_000)];
    const m3 = mission(missions(lignes, 16), "mission3");
    expect(m3).toMatchObject({ etat: "validee", actuel: 20_000, cible: 20_000 });
  });
});

describe("missions de l'étape 3 (AE-11)", () => {
  it("« Ouvrir ma boutique sans découvert » : 7 jours après la signature, lue en base, sans découvert", () => {
    const signature = new Date(CREATION_MS + 20 * JOUR).toISOString();
    const lignes = [
      e(0, "512", "debit", 5_000_000, "apport_initial"),
      e(20, "512", "credit", 2_500_000, "boutique_depot_1"),
      e(24, "512", "credit", 300_000, "boutique_loyer_1"),
    ];
    const avant = mission(missions(lignes, 26, { boutiques: [{ cree_le: signature }] }), "mission4");
    expect(avant).toMatchObject({ etat: "en_cours", actuel: 6, cible: 7 });
    const apres = mission(missions(lignes, 27, { boutiques: [{ cree_le: signature }] }), "mission4");
    expect(apres.etat).toBe("validee");
  });

  it("« Louer ou acheter » se valide par l'écriture de signature du bail ou d'achat du local", () => {
    expect(mission(missions([e(3, "275", "debit", 100, "bail_signature_abc")], 4), "mission5").etat).toBe("validee");
    expect(mission(missions([e(3, "213", "debit", 100, "achat_local_abc")], 4), "mission5").etat).toBe("validee");
    expect(mission(missions([e(3, "275", "debit", 100, "boutique_depot_abc")], 4), "mission5").etat).toBe("a_faire");
    expect(mission(missions([], 4, { localEnregistre: true }), "mission5").etat).toBe("validee");
  });
});

describe("texteAvancement", () => {
  it("jours pour les missions 2 et 4, euros pour la 3, nombre sinon", () => {
    expect(texteAvancement("mission2", 3, 7)).toBe("3 / 7 jours");
    expect(texteAvancement("mission4", 1, 7)).toBe("1 / 7 jours");
    expect(texteAvancement("mission3", 1_000_00, 2_000_00)).toMatch(/^1\s000,00 € \/ 2\s000,00 €$/);
    expect(texteAvancement("mission1", 12, 50)).toBe("12 / 50");
  });
});
