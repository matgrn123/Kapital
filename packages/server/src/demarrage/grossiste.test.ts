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

const commun = { companyId: "c1", productId: "prod_tshirt", moisCourant: 10, maintenant: new Date(0), debutReelMs: 0 };

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

describe("passerCommandeGrossiste : livraison en 30 minutes réelles", () => {
  const NOVEMBRE_2026 = 2026 * 12 + 10;
  const DECEMBRE_2026 = 2026 * 12 + 11;

  it("jeu. 26 nov. 2026 à 10 h 21 : livré à 10 h 51, en novembre 2026", async () => {
    const { base, inserts } = fausseBase();
    const maintenant = new Date(Date.UTC(2026, 10, 26, 9, 21));
    const r = await passerCommandeGrossiste(base, {
      ...commun,
      moisCourant: NOVEMBRE_2026,
      maintenant,
      quantite: 5,
      tresorerieCentimes: 2291150,
    });
    expect(r.livraisonPrevue).toBe(new Date(Date.UTC(2026, 10, 26, 9, 51)).toISOString());
    expect(inserts[0]).toMatchObject({
      instant_commande: maintenant.toISOString(),
      instant_livraison_prevue: r.livraisonPrevue,
      mois_jeu_commande: NOVEMBRE_2026,
      mois_jeu_livraison: NOVEMBRE_2026,
    });
  });

  it("commandé le 30 novembre à 23 h 45 (Paris) : livré le 1er décembre, compté en décembre", async () => {
    const { base, inserts } = fausseBase();
    await passerCommandeGrossiste(base, {
      ...commun,
      moisCourant: NOVEMBRE_2026,
      maintenant: new Date(Date.UTC(2026, 10, 30, 22, 45)),
      quantite: 5,
      tresorerieCentimes: 2291150,
    });
    expect(inserts[0]).toMatchObject({ mois_jeu_commande: NOVEMBRE_2026, mois_jeu_livraison: DECEMBRE_2026 });
  });

  it("horloge avancée par l'administration (debut_reel reculé d'un jour) : le mois suit l'heure du jeu", async () => {
    const { base, inserts } = fausseBase();
    const unJour = 86_400_000;
    // Réel : 30 nov. à 23 h 45 moins un jour ; jeu : 30 nov. à 23 h 45.
    const r = await passerCommandeGrossiste(base, {
      ...commun,
      moisCourant: NOVEMBRE_2026,
      maintenant: new Date(Date.UTC(2026, 10, 29, 22, 45)),
      debutReelMs: -unJour,
      quantite: 5,
      tresorerieCentimes: 2291150,
    });
    // L'instant enregistré reste réel : 30 minutes après la commande.
    expect(r.livraisonPrevue).toBe(new Date(Date.UTC(2026, 10, 29, 23, 15)).toISOString());
    expect(inserts[0]).toMatchObject({ mois_jeu_livraison: DECEMBRE_2026 });
  });
});
