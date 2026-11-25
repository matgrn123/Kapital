import { readFileSync } from "node:fs";
import { DEFINITIONS_MISSIONS, DERNIERE_ETAPE } from "@kapital/engine";
import { describe, expect, it } from "vitest";

/** Contrôle statique (la base n'est pas exécutée en test) de la migration 0039. */
const sql = readFileSync(
  new URL("../../../supabase/migrations/0039_etape3_missions_boutique.sql", import.meta.url),
  "utf8",
);

describe("migration 0039 : étape 3 et missions de la boutique (AE-11)", () => {
  it("companies.etape accepte la dernière étape du moteur", () => {
    expect(DERNIERE_ETAPE).toBe(3);
    expect(sql).toContain("drop constraint if exists companies_etape_check");
    expect(sql).toMatch(/add constraint companies_etape_check check \(etape between 0 and 3\)/);
  });

  it("la contrainte des missions accepte exactement les missions définies dans le moteur", () => {
    const ids = DEFINITIONS_MISSIONS.map((d) => `'${d.id}'`).join(", ");
    expect(sql).toContain(`check (mission_id in (${ids}))`);
  });

  it("les nouvelles sociétés reçoivent les cinq missions, les anciennes les deux nouvelles", () => {
    const declencheur = sql.slice(sql.indexOf("create or replace function public.initialiser_missions()"));
    for (const d of DEFINITIONS_MISSIONS) expect(declencheur).toContain(`(new.id, '${d.id}'`);
    expect(sql).toMatch(/\('mission4'::text, 0::bigint\),\s*\('mission5'::text, 1::bigint\)/);
  });

  it("est rejouable et ne détruit aucune donnée", () => {
    expect(sql.match(/on conflict do nothing/g)).toHaveLength(2);
    expect(sql).toContain("drop constraint if exists mission_progress_mission_id_check");
    expect(sql).not.toMatch(/drop table|delete from|truncate|drop column/i);
    expect(sql).toContain("set search_path = public");
  });
});
