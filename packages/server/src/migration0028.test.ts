import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Contrôle statique (la base n'est pas exécutée en test) : la migration 0028 ajoute l'achat
 * aux ateliers, reprend donner_conge et rafraichir_valeurs_entreprises de 0027 sans rien perdre,
 * et passe prêt, local et écriture d'achat dans une seule transaction.
 */
const lire = (f: string) =>
  readFileSync(new URL(`../../../supabase/migrations/${f}`, import.meta.url), "utf8");

function corpsFonction(sql: string, nom: string): string {
  const debut = sql.indexOf(`create or replace function public.${nom}(`);
  expect(debut, `fonction ${nom} absente`).toBeGreaterThan(-1);
  return sql.slice(debut, sql.indexOf("$$;", sql.indexOf("as $$", debut)) + 3);
}

describe("migration 0028 : achat à crédit", () => {
  const m0027 = lire("0027_bail.sql");
  const m0028 = lire("0028_achat_credit.sql");

  it("ajoute les colonnes de l'achat sans rien supprimer", () => {
    for (const col of ["prix_achat_centimes", "apport_centimes", "mois_achat", "duree_amortissement_mois"]) {
      expect(m0028).toContain(col);
    }
    expect(m0028).not.toMatch(/drop table|drop column/i);
  });

  it("acheter_local : verrou, refus d'un second local, apport minimal revérifié", () => {
    const f = corpsFonction(m0028, "acheter_local");
    expect(f).toContain("for update");
    expect(f).toContain("local_deja_detenu");
    expect(f).toContain("p_apport_centimes < p_apport_minimal_centimes");
    expect(f).toContain("apport_insuffisant");
  });

  it("acheter_local : prêt immobilier par creer_pret, puis 213 / 512 du prix entier, dans la même transaction", () => {
    const f = corpsFonction(m0028, "acheter_local");
    expect(f).toMatch(/perform public\.creer_pret\(\s*p_company_id, 'immobilier', v_pret/);
    expect(f).toMatch(/'213', 'debit', p_prix_centimes/);
    expect(f).toMatch(/'512', 'credit', p_prix_centimes/);
    expect(f).toContain("v_pret := p_prix_centimes - p_apport_centimes");
    // un local acheté n'a ni loyer ni dépôt
    expect(f).toMatch(/\(p_company_id, p_surface_m2, 0, p_nombre_machines/);
    expect(m0028).toMatch(/revoke all on function public\.acheter_local/);
    expect(m0028).toMatch(/grant execute on function public\.acheter_local[\s\S]*?service_role/);
  });

  it("le mode de détention écrit est accepté par la contrainte de 0027", () => {
    expect(m0027).toContain("check (mode_detention in ('bail', 'achat', 'credit'))");
    const f = corpsFonction(m0028, "acheter_local");
    expect(f).toContain("case when v_pret > 0 then 'credit' else 'achat' end");
  });

  it("donner_conge : identique à 0027, plus le refus d'un local possédé", () => {
    const ancien = corpsFonction(m0027, "donner_conge");
    const nouveau = corpsFonction(m0028, "donner_conge");
    const retour = nouveau
      .replace("  v_mode text;\n", "")
      .replace("select w.mois_fin, w.mode_detention into v_deja, v_mode", "select w.mois_fin into v_deja")
      .replace("  if v_mode <> 'bail' then\n    raise exception 'local_possede' using errcode = 'KP409';\n  end if;\n", "");
    expect(retour).toBe(ancien);
    expect(nouveau).toContain("local_possede");
    expect(m0028).toMatch(/grant execute on function public\.donner_conge/);
  });

  it("classement : identique à 0027, avec 213 et 2813 ajoutés aux comptes d'actif", () => {
    const ancien = corpsFonction(m0027, "rafraichir_valeurs_entreprises");
    const nouveau = corpsFonction(m0028, "rafraichir_valeurs_entreprises");
    expect(nouveau.replace("'512','275','213','2813')", "'512','275')")).toBe(ancien);
  });

  it("ne remplace pas appliquer_pas_entreprise (la clôture du moteur suffit)", () => {
    expect(m0028).not.toContain("create or replace function public.appliquer_pas_entreprise");
  });
});
