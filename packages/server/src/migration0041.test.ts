import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TYPES_EVENEMENTS } from "./evenements/types.js";

/** Contrôle statique (la base n'est pas exécutée en test) de la migration 0041. */
const sql = readFileSync(
  new URL("../../../supabase/migrations/0041_journal_evenements.sql", import.meta.url),
  "utf8",
);

describe("migration 0041 : journal d'événements", () => {
  it("crée la table evenements rattachée à la société", () => {
    expect(sql).toContain("create table if not exists public.evenements");
    expect(sql).toMatch(/company_id uuid not null references public\.companies\(id\) on delete cascade/);
    for (const colonne of ["type text not null", "cle text not null", "mois_jeu integer not null", "pas integer", "instant timestamptz not null", "titre text not null", "detail jsonb not null", "cree_le timestamptz not null default now()"]) {
      expect(sql).toContain(colonne);
    }
  });

  it("les types acceptés sont exactement ceux du serveur", () => {
    const types = TYPES_EVENEMENTS.map((t) => `'${t}'`).join(", ");
    expect(sql).toContain(`check (type in (${types}))`);
  });

  it("idempotence : une clé unique par société", () => {
    expect(sql).toMatch(/constraint evenements_company_cle_key unique \(company_id, cle\)/);
  });

  it("lecture limitée au propriétaire, aucune écriture côté joueur", () => {
    expect(sql).toContain("alter table public.evenements enable row level security");
    expect(sql).toMatch(/create policy "evenements_select_own"\s+on public\.evenements for select/);
    expect(sql).toContain("c.id = evenements.company_id and c.owner_profile_id = auth.uid()");
    expect(sql).toContain("revoke insert, update, delete on public.evenements from anon, authenticated");
    expect(sql).not.toMatch(/for (insert|update|delete|all)/i);
  });

  it("ajoute companies.derniere_visite_le sans toucher aux fonctions SQL", () => {
    expect(sql).toContain("alter table public.companies add column if not exists derniere_visite_le timestamptz");
    expect(sql).not.toMatch(/create (or replace )?function/i);
  });

  it("est rejouable et ne détruit aucune donnée", () => {
    expect(sql).not.toMatch(/drop table|delete from|truncate|drop column/i);
    expect(sql).toContain("drop policy if exists \"evenements_select_own\"");
    expect(sql).toContain("create index if not exists");
  });
});
