import { readFileSync } from "node:fs";
import { ACTIONS_MARKETING } from "@kapital/engine";
import { describe, expect, it } from "vitest";

/** Contrôle statique (la base n'est pas exécutée en test) de la migration 0042. */
const sql = readFileSync(
  new URL("../../../supabase/migrations/0042_marketing_actions.sql", import.meta.url),
  "utf8",
);

describe("migration 0042 : nouvelles publicités", () => {
  it("le moteur connaît dix actions", () => {
    expect(ACTIONS_MARKETING).toHaveLength(10);
  });

  it("la contrainte des types accepte exactement les actions du moteur", () => {
    const types = ACTIONS_MARKETING.map((a) => `'${a}'`).join(", ");
    expect(sql).toContain("drop constraint if exists marketing_actions_type_check");
    expect(sql).toContain(`add constraint marketing_actions_type_check\n  check (type in (${types}))`);
  });

  it("supprime toute ancienne contrainte de vérification portant sur le type (modèle de 0039)", () => {
    expect(sql).toContain("con.conrelid = 'public.marketing_actions'::regclass");
    expect(sql).toContain("pg_get_constraintdef(con.oid) ilike '%type%'");
    expect(sql).toContain("execute format('alter table %s drop constraint if exists %I'");
  });

  it("ajoute la colonne de l'aléa, sans valeur imposée", () => {
    expect(sql).toContain("alter table public.marketing_actions add column if not exists alea numeric;");
  });

  it("est rejouable, ne détruit aucune donnée et ne reprend aucune fonction", () => {
    expect(sql).not.toMatch(/drop table|delete from|truncate|drop column/i);
    expect(sql).not.toMatch(/create (or replace )?function/i);
  });
});
