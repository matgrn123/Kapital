import type { SupabaseClient } from "@supabase/supabase-js";
import type { CumulMois } from "@kapital/engine";
import { describe, expect, it } from "vitest";
import { StockageSupabase } from "./stockageSupabase.js";

type Ligne = { compte: string; sens: string; montant_centimes: number; mois_jeu: number };

// Fausse base : applique les filtres utilisés par chargerFinDeMois sur une liste de lignes.
// `cumul` : l'état du mois en cours enregistré par les pas (table etat_mois_entreprise).
function base(lignes: Ligne[], cumul: { mois: number; agregats: CumulMois["agregats"] } | null = null): SupabaseClient {
  const from = (table: string) => {
    const filtres: Array<(l: Ligne) => boolean> = [];
    let plage: [number, number] = [0, Number.MAX_SAFE_INTEGER];
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => {
        if (col === "compte") filtres.push((l) => l.compte === v);
        return q;
      },
      lte: (col: string, v: number) => (filtres.push((l) => (l as Record<string, unknown>)[col] as number <= v), q),
      gte: (col: string, v: number) => (filtres.push((l) => (l as Record<string, unknown>)[col] as number >= v), q),
      or: () => (filtres.push((l) => l.compte.startsWith("6") || l.compte.startsWith("7")), q),
      order: () => q,
      range: (de: number, a: number) => {
        plage = [de, a];
        return q;
      },
      maybeSingle: async () =>
        table === "etat_mois_entreprise"
          ? { data: cumul === null ? null : { cumul }, error: null }
          : { data: { mois_decouvert_consecutifs: 0 }, error: null },
      then: (ok: (v: unknown) => unknown) => {
        const data = table === "ledger_entries" ? lignes.filter((l) => filtres.every((f) => f(l))).slice(plage[0], plage[1] + 1) : [];
        return Promise.resolve(ok({ data, error: null }));
      },
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

describe("StockageSupabase.chargerFinDeMois", () => {
  it("TVA : paie le reste dû au 44551, sans alterner un mois sur deux", async () => {
    const lignes: Ligne[] = [
      { compte: "44551", sens: "credit", montant_centimes: 300, mois_jeu: 0 }, // déclarée mois 0
      { compte: "44551", sens: "debit", montant_centimes: 300, mois_jeu: 1 }, // payée mois 1
      { compte: "44551", sens: "credit", montant_centimes: 500, mois_jeu: 1 }, // déclarée mois 1
    ];
    const fin = await new StockageSupabase(base(lignes)).chargerFinDeMois("c1", 2);
    // Ancienne formule (solde du seul mois 1) : 500 − 300 = 200. Juste : 500.
    expect(fin.tvaAPayerCeMois).toBe(500);
    expect(fin.resultatExerciceAvantMois).toBeUndefined();
  });

  it("IS : au 12e mois, transmet le résultat des 11 mois déjà clos de l'exercice", async () => {
    const lignes: Ligne[] = [
      { compte: "707", sens: "credit", montant_centimes: 10_000, mois_jeu: 3 },
      { compte: "613", sens: "debit", montant_centimes: 4_000, mois_jeu: 5 },
      // Le mois en cours, passé par les pas : déjà compté par la clôture (cumul.agregats), exclu.
      { compte: "707", sens: "credit", montant_centimes: 99_999, mois_jeu: 11 },
    ];
    const cumul = { mois: 11, agregats: { tvaCollectee: 0, net512: 0, produits: 99_999, charges: 0 } };
    const fin = await new StockageSupabase(base(lignes, cumul)).chargerFinDeMois("c1", 11);
    expect(fin.resultatExerciceAvantMois).toBe(6_000);
  });

  it("IS : une publicité passée par la route au 12e mois (623) entre dans la base de l'impôt", async () => {
    // La route écrit au grand livre sans passer par les pas : ni dans les mois clos, ni dans
    // cumul.agregats. Sans correction, ces 30 € de charge échappaient à l'impôt de l'exercice.
    const lignes: Ligne[] = [
      { compte: "707", sens: "credit", montant_centimes: 10_000, mois_jeu: 3 },
      { compte: "613", sens: "debit", montant_centimes: 4_000, mois_jeu: 5 },
      { compte: "707", sens: "credit", montant_centimes: 99_999, mois_jeu: 11 }, // pas du mois
      { compte: "623", sens: "debit", montant_centimes: 3_000, mois_jeu: 11 }, // route publicité
      { compte: "512", sens: "credit", montant_centimes: 3_000, mois_jeu: 11 },
    ];
    const cumul = { mois: 11, agregats: { tvaCollectee: 0, net512: 0, produits: 99_999, charges: 0 } };
    const fin = await new StockageSupabase(base(lignes, cumul)).chargerFinDeMois("c1", 11);
    // 6 000 (mois clos) − 3 000 (publicité du mois, hors pas) ; la clôture ajoute ensuite les pas.
    expect(fin.resultatExerciceAvantMois).toBe(3_000);
  });

  it("IS : sans état du mois en cours (ou un état d'un autre mois), tout le mois en base est hors pas", async () => {
    const lignes: Ligne[] = [
      { compte: "707", sens: "credit", montant_centimes: 10_000, mois_jeu: 3 },
      { compte: "623", sens: "debit", montant_centimes: 3_000, mois_jeu: 11 },
    ];
    const ancien = { mois: 10, agregats: { tvaCollectee: 0, net512: 0, produits: 55_555, charges: 0 } };
    expect((await new StockageSupabase(base(lignes, ancien)).chargerFinDeMois("c1", 11)).resultatExerciceAvantMois).toBe(7_000);
    expect((await new StockageSupabase(base(lignes)).chargerFinDeMois("c1", 11)).resultatExerciceAvantMois).toBe(7_000);
  });

  it("IS : le premier mois d'un exercice n'est pas le dernier, aucune base transmise", async () => {
    const fin = await new StockageSupabase(base([])).chargerFinDeMois("c1", 12);
    expect(fin.resultatExerciceAvantMois).toBeUndefined();
  });
});
