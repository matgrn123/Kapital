import { readFileSync } from "node:fs";
import { chargerModulesV1 } from "@kapital/content";
import { MODULE_POSE_A_LA_SIGNATURE, positionsPostesALaSignature, validerPlanEtage } from "@kapital/engine";
import { describe, expect, it } from "vitest";

/** Contrôle statique (la base n'est pas exécutée en test) de la migration 0036. */
const sql = readFileSync(
  new URL("../../../supabase/migrations/0036_postes_poses.sql", import.meta.url),
  "utf8",
);

function fonction(nom: string): string {
  const debut = sql.indexOf(`create or replace function public.${nom}(`);
  expect(debut).toBeGreaterThanOrEqual(0);
  const fin = sql.indexOf("$$;", debut);
  return sql.slice(debut, fin);
}

describe("migration 0036 : postes posés à la signature", () => {
  it("signer_bail et acheter_local posent des postes de couture de base, sans écrire nombre_machines", () => {
    for (const nom of ["signer_bail", "acheter_local"]) {
      const f = fonction(nom);
      expect(f).toContain("insert into public.placed_modules (workshop_id, module_type_id, x, y, pivote)");
      expect(f).toContain(`'${MODULE_POSE_A_LA_SIGNATURE}', 2 + 3 * (i - 1), 1, false`);
      expect(f).toContain("generate_series(1, p_nombre_machines)");
      expect(f).not.toMatch(/nombre_machines,/);
    }
  });

  it("garde les signatures de 0027 et 0028 (les routes ne changent pas)", () => {
    expect(sql).toMatch(
      /grant execute on function public\.signer_bail\(uuid, text, integer, bigint, bigint, bigint, integer, integer\)\s*to service_role/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.acheter_local\(uuid, text, integer, bigint, bigint, bigint, bigint, integer, integer, integer, numeric, integer, timestamptz, bigint, jsonb\)\s*to service_role/,
    );
  });

  it("les cases de la formule SQL sont celles du moteur, et le plan est valide sur la grille 10 × 5", () => {
    // Formule SQL : x = 2 + 3 * (i - 1), y = 1, pour i = 1..n
    const sqlPositions = [1, 2].map((i) => ({ id_type: MODULE_POSE_A_LA_SIGNATURE, x: 2 + 3 * (i - 1), y: 1, pivote: false }));
    expect(sqlPositions).toEqual(positionsPostesALaSignature(2));
    const r = validerPlanEtage({ largeur: 10, hauteur: 5, entree_x: 0, entree_y: 3, modules: sqlPositions }, [...chargerModulesV1()]);
    expect(r.valide).toBe(true);
  });

  it("reprise idempotente : seuls les ateliers sans aucun module reçoivent 2 postes, pas les boutiques", () => {
    const reprise = sql.slice(sql.lastIndexOf("insert into public.placed_modules"));
    expect(reprise).toContain("generate_series(1, 2)");
    expect(reprise).toContain("where not exists (select 1 from public.placed_modules pm where pm.workshop_id = w.id)");
    expect(reprise).toContain("not like 'boutique%'");
  });

  it("n'écrit aucune écriture comptable nouvelle, ne supprime rien, ne touche pas au schéma", () => {
    expect(sql).not.toMatch(/drop |alter table|create table|delete from/i);
    // Seules écritures : celles reprises de 0027 (dépôt 275 / 512) et 0028 (achat 213 / 512).
    expect(sql.match(/insert into public\.ledger_entries/g)).toHaveLength(2);
    expect(sql).not.toContain("'2154'");
  });
});
