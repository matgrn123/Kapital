import { readFileSync } from "node:fs";
import {
  PLAN_COMPTABLE_V1,
  PREFIXE_DEPOT_BOUTIQUE,
  PREFIXE_TRAVAUX_BOUTIQUE,
  valeurSortieCmp,
  centimes,
  idProduit,
} from "@kapital/engine";
import { describe, expect, it } from "vitest";

/** Contrôle statique (la base n'est pas exécutée en test) de la migration 0038. */
const sql = readFileSync(new URL("../../../supabase/migrations/0038_boutique.sql", import.meta.url), "utf8");

function fonction(nom: string): string {
  const debut = sql.indexOf(`create or replace function public.${nom}(`);
  expect(debut).toBeGreaterThanOrEqual(0);
  return sql.slice(debut, sql.indexOf("$$;", debut));
}

describe("migration 0038 : boutique (AE-10)", () => {
  it("est rejouable : tables, index, politiques et colonnes protégés", () => {
    expect(sql).toContain("create table if not exists public.points_de_vente");
    expect(sql).toContain("create table if not exists public.stock_boutique");
    expect(sql).toContain("add column if not exists prix_boutique_centimes");
    expect(sql).toMatch(/drop policy if exists "points_de_vente_select_own"/);
    expect(sql).toMatch(/drop policy if exists "stock_boutique_select_own"/);
    expect(sql).toContain("drop constraint if exists employees_poste_check");
    expect(sql).not.toMatch(/drop table|delete from|truncate/i);
  });

  it("RLS : lecture par le propriétaire seulement, aucune écriture côté client", () => {
    expect(sql).toContain("alter table public.points_de_vente enable row level security");
    expect(sql).toContain("alter table public.stock_boutique enable row level security");
    expect(sql.match(/on public\.\w+ for select/g)).toHaveLength(2);
    expect(sql).not.toMatch(/on public\.\w+ for (insert|update|delete|all)/);
    expect(sql).toContain("c.owner_profile_id = auth.uid()");
    for (const f of ["ouvrir_boutique", "transferer_stock_boutique", "appliquer_pas_boutique"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${f}\\([^)]*\\)\\s*from public, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\)\\s*to service_role`));
    }
  });

  it("le poste vendeur s'ajoute aux postes de 0006", () => {
    expect(sql).toContain("check (poste in ('artisan', 'encadrement', 'vendeur'))");
  });

  it("ouvrir_boutique : verrou, une seule boutique active, trésorerie revérifiée, écritures 275 / 512 et 2135 / 512", () => {
    const f = fonction("ouvrir_boutique");
    expect(f).toContain("for update");
    expect(f).toContain("boutique_deja_ouverte");
    expect(f).toContain("v_tresorerie < p_depot_centimes + p_travaux_centimes");
    expect(f).toContain(`'${PREFIXE_DEPOT_BOUTIQUE}' || v_id::text`);
    expect(f).toContain(`'${PREFIXE_TRAVAUX_BOUTIQUE}' || v_id::text`);
    expect(f).toMatch(/'275', 'debit', p_depot_centimes[\s\S]*'512', 'credit', p_depot_centimes/);
    expect(f).toMatch(/'2135', 'debit', p_travaux_centimes[\s\S]*'512', 'credit', p_travaux_centimes/);
    expect(f.match(/insert into public\.ledger_entries/g)).toHaveLength(2);
  });

  it("transferer_stock_boutique : aucune écriture, même formule de coût moyen que le moteur", () => {
    const f = fonction("transferer_stock_boutique");
    expect(f).not.toContain("ledger_entries");
    expect(f).toContain("round(v_valeur::numeric * p_quantite / v_quantite)::bigint");
    expect(f).toContain("if p_quantite = v_quantite then\n    v_sortie := v_valeur;");
    // Le moteur : round(valeur × q / quantité) et tout le stock = toute la valeur.
    const ligne = { produit: idProduit("p"), quantite: 7, valeurTotale: centimes(10_001) };
    expect(valeurSortieCmp(ligne, 3)).toBe(Math.round((10_001 * 3) / 7));
    expect(valeurSortieCmp(ligne, 7)).toBe(10_001);
  });

  it("appliquer_pas_boutique : appelle appliquer_pas_entreprise sans la redéfinir, puis les stocks des boutiques", () => {
    expect(sql).not.toContain("create or replace function public.appliquer_pas_entreprise(");
    const f = fonction("appliquer_pas_boutique");
    expect(f).toContain("public.appliquer_pas_entreprise(p_company_id, p_pas_attendu, p_etat, p_nb_pas)");
    expect(f).toContain("p_etat->'stocks_boutique'");
    expect(f).toContain("p.id = x.point_de_vente_id and p.company_id = p_company_id");
  });

  it("classement et comptes publics : les agencements comptent à l'actif", () => {
    const f = fonction("rafraichir_valeurs_entreprises");
    expect(f).toContain("'2135','28135'");
    const vue = sql.slice(sql.indexOf("create or replace view public.comptes_publics"));
    const liste = /l\.compte in \(([^)]*)\)/.exec(vue)?.[1] ?? "";
    const comptes = [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
    const actifs = PLAN_COMPTABLE_V1.filter((c) => c.type === "actif").map((c) => c.numero).sort();
    expect(comptes).toEqual(actifs);
  });
});
