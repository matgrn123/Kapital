import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Contrôle statique (la base n'est pas exécutée en test) de la migration 0031. */
const sql = readFileSync(
  new URL("../../../supabase/migrations/0031_classement_cron_et_amenagement.sql", import.meta.url),
  "utf8",
);

describe("migration 0031 : classement et aménagement", () => {
  it("programme rafraichir_valeurs_entreprises toutes les 30 minutes, sans échouer si pg_cron manque", () => {
    expect(sql).toMatch(/cron\.schedule\(\s*'rafraichir_classement',\s*'\*\/30 \* \* \* \*'/);
    expect(sql).toContain("public.rafraichir_valeurs_entreprises()");
    expect(sql).toMatch(/exception when others then\s*raise notice/);
  });

  it("ne modifie aucune table et ne supprime rien d'autre que les modules de l'atelier", () => {
    expect(sql).not.toMatch(/drop |alter table|create table/i);
    expect(sql.match(/delete from/gi)).toHaveLength(1);
    expect(sql).toContain("delete from public.placed_modules where workshop_id = p_workshop_id");
  });

  it("verrouille l'entreprise et l'atelier, refuse une trésorerie trop courte", () => {
    expect(sql).toMatch(/from public\.companies where id = p_company_id for update/);
    expect(sql).toMatch(/company_id = p_company_id\s*for update/);
    expect(sql).toContain("v_tresorerie < p_cout_centimes");
    expect(sql).toContain("KP422");
  });

  it("écrit 2154 au débit et 512 au crédit du même montant", () => {
    expect(sql).toMatch(/'2154', 'debit', p_cout_centimes/);
    expect(sql).toMatch(/'512', 'credit', p_cout_centimes/);
  });

  it("n'est appelable que par le service", () => {
    expect(sql).toMatch(/revoke all on function public\.sauvegarder_amenagement/);
    expect(sql).toMatch(/grant execute on function public\.sauvegarder_amenagement[\s\S]*?service_role/);
  });
});
