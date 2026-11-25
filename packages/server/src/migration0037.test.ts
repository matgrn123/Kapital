import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chargeUtileDepuisLot } from "./avance/stockageSupabase.js";

/** Contrôle statique (la base n'est pas exécutée en test) de la migration 0037. */
const sql = readFileSync(
  new URL("../../../supabase/migrations/0037_amenagement_prevu.sql", import.meta.url),
  "utf8",
);
const sql0027 = readFileSync(new URL("../../../supabase/migrations/0027_bail.sql", import.meta.url), "utf8");

function fonction(source: string, nom: string): string {
  const debut = source.indexOf(`create or replace function public.${nom}(`);
  expect(debut).toBeGreaterThanOrEqual(0);
  const fin = source.indexOf("$$;", debut);
  return source.slice(debut, fin);
}

describe("migration 0037 : plan d'aménagement prévu, appliqué à la clôture", () => {
  it("ajoute placed_modules.statut (actif | prevu, défaut actif) sans toucher aux lignes existantes", () => {
    expect(sql).toMatch(/add column if not exists statut text not null default 'actif'/);
    expect(sql).toMatch(/check \(statut in \('actif', 'prevu'\)\)/);
    expect(sql).toMatch(/drop constraint if exists placed_modules_statut_check/);
    expect(sql).toMatch(/add column if not exists plan_prevu_mois integer/);
    expect(sql).toMatch(/add column if not exists plan_prevu_cout_centimes bigint not null default 0/);
    expect(sql).not.toMatch(/drop table|drop column|truncate/i);
  });

  it("sauvegarder_amenagement écrit le plan en prévu et ne touche pas au plan actif", () => {
    const f = fonction(sql, "sauvegarder_amenagement");
    expect(f).toContain("delete from public.placed_modules where workshop_id = p_workshop_id and statut = 'prevu'");
    expect(f).not.toMatch(/delete from public\.placed_modules where workshop_id = p_workshop_id;/);
    expect(f).toMatch(/'prevu'\s*from jsonb_array_elements\(p_modules\)/);
    expect(f).toContain("set plan_prevu_mois = p_mois_jeu");
  });

  it("paie les modules à l'enregistrement (2154 / 512) et rembourse la commande du plan prévu remplacé", () => {
    const f = fonction(sql, "sauvegarder_amenagement");
    expect(f).toMatch(/'2154', 'debit', p_cout_centimes/);
    expect(f).toMatch(/'512', 'credit', p_cout_centimes/);
    expect(f).toMatch(/'512', 'debit', v_cout_precedent/);
    expect(f).toMatch(/'2154', 'credit', v_cout_precedent/);
    // Le remboursement compte dans la trésorerie disponible, sous verrou.
    expect(f).toContain("v_tresorerie + v_cout_precedent < p_cout_centimes");
    expect(f).toMatch(/from public\.companies where id = p_company_id for update/);
  });

  it("annuler_amenagement_prevu supprime le plan prévu et contre-passe sa commande", () => {
    const f = fonction(sql, "annuler_amenagement_prevu");
    expect(f).toContain("delete from public.placed_modules where workshop_id = p_workshop_id and statut = 'prevu'");
    expect(f).toMatch(/'512', 'debit', v_cout/);
    expect(f).toMatch(/'2154', 'credit', v_cout/);
    expect(f).toContain("aucun_plan_prevu");
  });

  it("appliquer_pas_entreprise promeut le plan prévu quand le lot clôt un mois, avant la fin de bail", () => {
    const f = fonction(sql, "appliquer_pas_entreprise");
    const promotion = f.indexOf("? 'mois_decouvert_consecutifs'");
    expect(promotion).toBeGreaterThan(0);
    expect(f).toMatch(/set statut = 'actif'[\s\S]*?pm\.statut = 'prevu'/);
    expect(f).toMatch(/pm\.statut = 'actif'/);
    expect(promotion).toBeLessThan(f.indexOf("bail_restitution"));
  });

  it("reprend appliquer_pas_entreprise de 0027 à l'identique, en dehors de la promotion", () => {
    const avant = fonction(sql0027, "appliquer_pas_entreprise");
    const apres = fonction(sql, "appliquer_pas_entreprise");
    const debutBloc = apres.indexOf("  -- 3D-5 :");
    const finBloc = apres.indexOf("  -- Fin de bail (AE-5)");
    expect(apres.slice(0, debutBloc) + apres.slice(finBloc)).toBe(avant);
  });

  it("le marqueur de clôture n'est présent dans la charge utile que si le lot a clos un mois", () => {
    const lot = {
      ecritures: [],
      entreprise: {
        statut: "active", etape: 0, stocksMatiere: [], stocksFinis: [], prets: [],
        marque: { notoriete: 0, desirabilite: 0 },
      },
      echeancesPayees: [],
      commandesMatiereLivrees: [],
      ordresFaconnierLivres: [],
      cumul: null,
    } as unknown as Parameters<typeof chargeUtileDepuisLot>[0];
    expect(chargeUtileDepuisLot({ ...lot, moisDecouvertConsecutifs: null }).entreprise).not.toHaveProperty("mois_decouvert_consecutifs");
    expect(chargeUtileDepuisLot({ ...lot, moisDecouvertConsecutifs: 0 }).entreprise).toHaveProperty("mois_decouvert_consecutifs", 0);
  });

  it("les fonctions ne sont appelables que par le service", () => {
    for (const nom of ["sauvegarder_amenagement", "annuler_amenagement_prevu", "appliquer_pas_entreprise"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${nom}[\\s\\S]*?from public, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${nom}[\\s\\S]*?to service_role`));
    }
  });
});
