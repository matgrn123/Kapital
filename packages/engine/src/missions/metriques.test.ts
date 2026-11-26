import { describe, expect, it } from "vitest";
import { finDuMoisMs, indexDuMois } from "../moteur/temps.js";
import { metriquesDepuisGrandLivre, type LigneGrandLivreMission } from "./metriques.js";
import type { ReglesMissions } from "./types.js";

// Métriques des missions lues dans le grand livre, datées à la minute (ledger_entries.cree_le).

const JOUR = 86_400_000;
const CREATION = Date.UTC(2026, 10, 26, 9, 21); // 26 nov. 2026, 10 h 21 à Paris
const NOVEMBRE = indexDuMois(2026, 11);
const REGLES: ReglesMissions = { joursTenir: 7, joursPeriodeCroissance: 7, joursBoutique: 7 };

function ligne(
  jours: number | null,
  compte: string,
  sens: "debit" | "credit",
  montant: number,
  libelle = "test",
  mois: number = NOVEMBRE,
): LigneGrandLivreMission {
  return {
    ecriture_id: "x",
    mois_jeu: mois,
    libelle,
    compte,
    sens,
    montant_centimes: montant,
    ...(jours === null ? {} : { instant_ms: CREATION + jours * JOUR }),
  };
}

const contexte = (maintenantJours: number) => ({
  creationMs: CREATION,
  maintenantMs: CREATION + maintenantJours * JOUR,
  regles: REGLES,
});

describe("trésorerie au fil des écritures", () => {
  it("solde cumulé dans l'ordre chronologique, une valeur par instant", () => {
    const m = metriquesDepuisGrandLivre(
      [
        ligne(2, "512", "credit", 300),
        ligne(0, "512", "debit", 1000),
        ligne(2, "512", "debit", 50),
        ligne(3, "512", "credit", 900),
      ],
      contexte(5),
    );
    expect(m.tresorerie.map((p) => [(p.instant_ms - CREATION) / JOUR, p.solde_centimes])).toEqual([
      [0, 1000],
      [2, 750],
      [3, -150],
    ]);
    expect(m.a_eu_decouvert).toBe(true);
  });

  it("un découvert passager en cours de mois compte (il ne se voit pas en fin de mois)", () => {
    const m = metriquesDepuisGrandLivre(
      [ligne(0, "512", "debit", 1000), ligne(1, "512", "credit", 1500), ligne(2, "512", "debit", 2000)],
      contexte(5),
    );
    expect(m.a_eu_decouvert).toBe(true);
  });

  it("sans instant (banc d'essai), une écriture est datée du dernier instant de son mois", () => {
    const m = metriquesDepuisGrandLivre(
      [ligne(null, "512", "debit", 1000, "apport", NOVEMBRE), ligne(null, "512", "credit", 300, "loyer", NOVEMBRE + 1)],
      contexte(60),
    );
    expect(m.tresorerie).toEqual([
      { instant_ms: finDuMoisMs(NOVEMBRE) - 1, solde_centimes: 1000 },
      { instant_ms: finDuMoisMs(NOVEMBRE + 1) - 1, solde_centimes: 700 },
    ]);
    expect(m.a_eu_decouvert).toBe(false);
  });
});

describe("chiffre d'affaires par semaine (périodes de 7 jours depuis la création)", () => {
  const vente = (jours: number, montant: number) => ligne(jours, "707", "credit", montant, "Vente directe 1 × t-shirt");

  it("première semaine avec des ventes et meilleure semaine", () => {
    const m = metriquesDepuisGrandLivre(
      [vente(1, 10_000), vente(6.9, 5_000), vente(8, 20_000), vente(15, 40_000), vente(16, 1_000)],
      contexte(20),
    );
    expect(m.ca_periode_initiale_centimes).toBe(15_000);
    expect(m.ca_periode_max_centimes).toBe(41_000);
  });

  it("une semaine sans vente ne sert pas de référence ; un avoir (débit 707) se déduit", () => {
    const m = metriquesDepuisGrandLivre(
      [vente(9, 10_000), ligne(10, "707", "debit", 2_000), vente(22, 30_000)],
      contexte(25),
    );
    expect(m.ca_periode_initiale_centimes).toBe(8_000);
    expect(m.ca_periode_max_centimes).toBe(30_000);
  });
});

describe("autres métriques", () => {
  it("pièces vendues, marge brute, local signé, boutiques et instants transmis", () => {
    const m = metriquesDepuisGrandLivre(
      [
        ligne(1, "707", "credit", 3_000, "Vente directe 3 × t-shirt"),
        ligne(1, "7135", "debit", 1_200),
        { ...ligne(2, "275", "debit", 100), ecriture_id: "bail_signature_abc" },
      ],
      { ...contexte(4), boutiques: [{ signee_le_ms: CREATION + JOUR }] },
    );
    expect(m.pieces_vendues_total).toBe(3);
    expect(m.marge_brute_cumul_centimes).toBe(1_800);
    expect(m.local_signe).toBe(true);
    expect(m.boutiques).toEqual([{ signee_le_ms: CREATION + JOUR }]);
    expect(m.creation_ms).toBe(CREATION);
    expect(m.maintenant_ms).toBe(CREATION + 4 * JOUR);
    expect(m.regles).toEqual(REGLES);
  });
});
