import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Contrôle statique (la base n'est pas exécutée en test) de la migration 0029. */
const sql = readFileSync(
  new URL("../../../supabase/migrations/0029_licenciement.sql", import.meta.url),
  "utf8",
);

describe("migration 0029 : licenciement", () => {
  it("ne modifie aucune table et ne supprime rien", () => {
    expect(sql).not.toMatch(/drop |alter table|create table/i);
  });

  it("verrouille l'entreprise, ne licencie qu'un salarié actif et refuse une trésorerie trop courte", () => {
    expect(sql).toContain("for update");
    expect(sql).toMatch(/statut = 'actif'/);
    expect(sql).toContain("salarie_introuvable");
    expect(sql).toContain("v_tresorerie < p_indemnite_centimes");
    expect(sql).toContain("KP422");
  });

  it("écrit 641 au débit et 512 au crédit du même montant, dans la même transaction", () => {
    expect(sql).toMatch(/'641', 'debit', p_indemnite_centimes/);
    expect(sql).toMatch(/'512', 'credit', p_indemnite_centimes/);
  });

  it("n'est appelable que par le service", () => {
    expect(sql).toMatch(/revoke all on function public\.licencier_salarie/);
    expect(sql).toMatch(/grant execute on function public\.licencier_salarie[\s\S]*?service_role/);
  });
});
