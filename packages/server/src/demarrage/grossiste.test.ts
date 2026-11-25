import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { CommandeRefusee, passerCommandeGrossiste } from "./lancement.js";

// Fausse base : sert le produit et le catalogue, note les insertions.
function fausseBase() {
  const inserts: unknown[] = [];
  const reponses: Record<string, unknown> = {
    products: {
      id: "prod_tshirt",
      matiere_id: "mat_jersey_coton",
      consommation_par_piece: 0.8,
      fournitures_par_piece_centimes: 60,
    },
    supplier_catalogue: [
      { material_id: "mat_jersey_coton", prix_centimes: 350 },
      { material_id: "mat_jersey_coton", prix_centimes: 420 },
      { material_id: "mat_jersey_coton", prix_centimes: 500 },
    ],
  };
  const requete = (table: string) => {
    const r = {
      select: () => r,
      eq: () => r,
      maybeSingle: async () => ({ data: reponses[table], error: null }),
      then: (ok: (v: unknown) => unknown) => ok({ data: reponses[table], error: null }),
      insert: async (ligne: unknown) => {
        inserts.push(ligne);
        return { error: null };
      },
    };
    return r;
  };
  return { base: { from: requete } as unknown as SupabaseClient, inserts };
}

const commun = { companyId: "c1", productId: "prod_tshirt", moisCourant: 10, maintenant: new Date(0) };

describe("passerCommandeGrossiste : plafond de trésorerie", () => {
  it("passe une commande payable", async () => {
    const { base, inserts } = fausseBase();
    const r = await passerCommandeGrossiste(base, { ...commun, quantite: 5, tresorerieCentimes: 2291150 });
    expect(r.quantite).toBe(5);
    expect(inserts).toHaveLength(1);
  });

  it("refuse 99 999 999 pièces sans rien écrire", async () => {
    const { base, inserts } = fausseBase();
    const essai = passerCommandeGrossiste(base, { ...commun, quantite: 99999999, tresorerieCentimes: 2291150 });
    await expect(essai).rejects.toBeInstanceOf(CommandeRefusee);
    await expect(essai).rejects.toMatchObject({ code: "tresorerie_insuffisante" });
    expect(inserts).toHaveLength(0);
  });

  it("refuse une commande quand la trésorerie est vide", async () => {
    const { base, inserts } = fausseBase();
    await expect(
      passerCommandeGrossiste(base, { ...commun, quantite: 1, tresorerieCentimes: 50 }),
    ).rejects.toMatchObject({ code: "tresorerie_insuffisante" });
    expect(inserts).toHaveLength(0);
  });
});
