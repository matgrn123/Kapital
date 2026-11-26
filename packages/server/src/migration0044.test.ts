import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Contrôle statique (la base n'est pas exécutée en test) de la migration 0044. */
const sql = readFileSync(
  new URL("../../../supabase/migrations/0044_delais_heures.sql", import.meta.url),
  "utf8",
);

/** Délais validés par Mathieu le 26 novembre 2026, en heures réelles. */
const DELAIS_FOURNISSEURS = { four_fr: 2, four_pt: 4, four_tr: 6 } as const;
const DELAIS_FACONNIERS = { fac_pt: 6, fac_tr: 8 } as const;

describe("migration 0044 : délais de livraison en heures réelles", () => {
  it("ajoute la colonne delai_heures aux fournisseurs et aux façonniers, positive ou nulle", () => {
    for (const table of ["suppliers", "faconniers"]) {
      expect(sql).toContain(`alter table public.${table}\n  add column if not exists delai_heures integer`);
      expect(sql).toMatch(new RegExp(`alter table public\\.${table}\\s+alter column delai_heures set not null`));
      expect(sql).toMatch(new RegExp(`${table}_delai_heures_positif check \\(delai_heures >= 0\\)`));
    }
  });

  it("renseigne les délais validés : fournisseurs France 2 h, Portugal 4 h, Turquie 6 h", () => {
    for (const [id, heures] of Object.entries(DELAIS_FOURNISSEURS)) {
      expect(sql).toMatch(new RegExp(`update public\\.suppliers set delai_heures = ${heures} where id = '${id}';`));
    }
  });

  it("renseigne les délais validés : façonniers Portugal 6 h, Turquie 8 h", () => {
    for (const [id, heures] of Object.entries(DELAIS_FACONNIERS)) {
      expect(sql).toMatch(new RegExp(`update public\\.faconniers set delai_heures = ${heures} where id = '${id}';`));
    }
  });

  it("le grossiste local garde 0 dans la base : son délai vient du paramètre grossiste_delai_minutes", () => {
    expect(sql).toMatch(/update public\.faconniers set delai_heures = 0 where id = 'gros_local';/);
    expect(sql).toContain("grossiste_delai_minutes");
  });

  it("aucune ligne ne reste sans délai avant le passage en not null", () => {
    for (const table of ["suppliers", "faconniers"]) {
      const remplissage = sql.indexOf(`update public.${table} set delai_heures = coalesce`);
      const notNull = sql.indexOf(`alter table public.${table}\n  alter column delai_heures set not null`);
      expect(remplissage).toBeGreaterThan(-1);
      expect(notNull).toBeGreaterThan(remplissage);
    }
  });

  it("est rejouable et ne détruit aucune donnée (delai_mois reste, pour le code déjà déployé)", () => {
    expect(sql).toContain("add column if not exists delai_heures");
    expect(sql.match(/drop constraint if exists (suppliers|faconniers)_delai_heures_positif/g)).toHaveLength(2);
    expect(sql).not.toMatch(/drop table|delete from|truncate|drop column/i);
  });
});
