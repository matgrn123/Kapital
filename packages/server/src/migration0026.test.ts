import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Contrôle statique (la base n'est pas exécutée en test) : la migration 0026 ajoute l'objet
 * du prêt et une fonction qui enregistre prêt, échéancier et écriture dans une seule transaction.
 */
const lire = (f: string) =>
  readFileSync(new URL(`../../../supabase/migrations/${f}`, import.meta.url), "utf8");

describe("migration 0026 : capacité d'emprunt", () => {
  const m = lire("0026_capacite_emprunt.sql");
  const route = readFileSync(
    new URL("../../../apps/web/app/api/actions/demander-pret/route.ts", import.meta.url),
    "utf8",
  );

  it("ajoute loans.objet, limité aux trois objets, sans casser les prêts existants", () => {
    expect(m).toMatch(/add column if not exists objet text not null default 'tresorerie'/);
    expect(m).toMatch(/check \(objet in \('tresorerie', 'equipement', 'immobilier'\)\)/);
  });

  it("crée le prêt, l'échéancier avec mois_jeu et l'écriture 512/164 dans une seule fonction", () => {
    expect(m).toMatch(/create or replace function public\.creer_pret\(/);
    expect(m).toMatch(/insert into public\.loans/);
    expect(m).toMatch(/insert into public\.loan_schedules/);
    expect(m).toMatch(/p_mois_jeu \+ x\.numero/);
    expect(m).toMatch(/'512', 'debit'/);
    expect(m).toMatch(/'164', 'credit'/);
    // une seule instruction pour l'écriture : le trigger d'équilibre la voit complète
    expect(m.match(/insert into public\.ledger_entries/g)).toHaveLength(1);
  });

  it("verrouille l'entreprise et revérifie le plafond d'endettement sous verrou", () => {
    expect(m).toContain("for update");
    expect(m).toContain("KP422");
    expect(m).toContain("p_plafond_endettement_centimes");
  });

  it("refuse un échéancier qui ne rembourse pas exactement le capital", () => {
    expect(m).toContain("echeancier_incoherent");
  });

  it("n'est appelable que par la clé de service", () => {
    expect(m).toMatch(/revoke all on function public\.creer_pret\(.*\)\s+from public, anon, authenticated/s);
    expect(m).toMatch(/grant execute on function public\.creer_pret\(.*\)\s+to service_role/s);
  });

  it("ne modifie aucune table des migrations précédentes autrement que par add column / constraint", () => {
    expect(m).not.toMatch(/drop (table|column)/i);
  });

  it("la route n'a plus ni taux ni plafond en dur, ni échéancier dupliqué", () => {
    expect(route).not.toMatch(/TAUX_ANNUEL|0\.055|\* 5\b|function mensualite|function genererEcheancier/);
    expect(route).toContain("genererEcheancier");
    expect(route).toContain("evaluerDemandePret");
    expect(route).toContain('rpc("creer_pret"');
  });
});
