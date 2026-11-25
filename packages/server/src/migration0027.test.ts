import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PREFIXE_RESTITUTION_DEPOT } from "@kapital/engine";

/**
 * Contrôle statique (la base n'est pas exécutée en test) : la migration 0027 ajoute le bail
 * aux ateliers, remplace appliquer_pas_entreprise à partir de la version de 0025 sans rien
 * perdre, et libère le local à la restitution du dépôt.
 */
const lire = (f: string) =>
  readFileSync(new URL(`../../../supabase/migrations/${f}`, import.meta.url), "utf8");

function corpsFonction(sql: string, nom: string): string {
  const debut = sql.indexOf(`create or replace function public.${nom}(`);
  expect(debut, `fonction ${nom} absente`).toBeGreaterThan(-1);
  return sql.slice(debut, sql.indexOf("$$;", sql.indexOf("as $$", debut)) + 3);
}

describe("migration 0027 : bail", () => {
  const m0025 = lire("0025_etapes.sql");
  const m0027 = lire("0027_bail.sql");

  it("ajoute les colonnes du bail sans toucher aux ateliers existants", () => {
    for (const col of [
      "batiment_id",
      "mode_detention",
      "depot_garantie_centimes",
      "charges_mensuelles_centimes",
      "mois_signature",
      "mois_conge",
      "mois_fin",
    ]) {
      expect(m0027).toContain(col);
    }
    expect(m0027).toMatch(/depot_garantie_centimes bigint not null default 0/);
    expect(m0027).not.toMatch(/drop table|drop column/i);
  });

  it("appliquer_pas_entreprise : identique à 0025, plus la libération du local", () => {
    const ancien = corpsFonction(m0025, "appliquer_pas_entreprise");
    const nouveau = corpsFonction(m0027, "appliquer_pas_entreprise");
    // retirer le bloc ajouté doit redonner exactement la version de 0025
    const sansAjout = nouveau.replace(/ {2}-- Fin de bail \(AE-5\)[\s\S]*?end if;\n\n/, "");
    expect(sansAjout).toBe(ancien);
    expect(nouveau).toContain("delete from public.workshops where company_id = p_company_id");
    expect(nouveau).toContain(`like '${PREFIXE_RESTITUTION_DEPOT.slice(0, -1) + "\\_"}%'`);
    expect(m0027).toMatch(/grant execute on function public\.appliquer_pas_entreprise/);
  });

  it("signer_bail : verrou, refus d'un second local, écriture 275 / 512 équilibrée dans la même transaction", () => {
    const f = corpsFonction(m0027, "signer_bail");
    expect(f).toContain("for update");
    expect(f).toContain("local_deja_loue");
    expect(f).toMatch(/'275', 'debit', p_depot_centimes/);
    expect(f).toMatch(/'512', 'credit', p_depot_centimes/);
    expect(m0027).toMatch(/revoke all on function public\.signer_bail/);
    expect(m0027).toMatch(/grant execute on function public\.signer_bail[\s\S]*?service_role/);
  });

  it("donner_conge : un seul congé, fin = mois du congé + préavis", () => {
    const f = corpsFonction(m0027, "donner_conge");
    expect(f).toContain("conge_deja_donne");
    expect(f).toContain("p_mois_conge + p_preavis_mois");
    expect(m0027).toMatch(/grant execute on function public\.donner_conge/);
  });

  it("le classement compte le dépôt (275) comme un actif", () => {
    const f = corpsFonction(m0027, "rafraichir_valeurs_entreprises");
    expect(f).toContain("'512','275'");
  });
});
