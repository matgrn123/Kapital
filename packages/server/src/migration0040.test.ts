import { readFileSync } from "node:fs";
import {
  centimes,
  ecritureRestitutionDepot,
  MODULE_POSE_A_LA_SIGNATURE,
  moisJeu,
  PREFIXE_RESTITUTION_DEPOT,
} from "@kapital/engine";
import { describe, expect, it } from "vitest";

/** Contrôle statique (la base n'est pas exécutée en test) de la migration 0040 (3D-7). */
const sql = readFileSync(new URL("../../../supabase/migrations/0040_multi_locaux.sql", import.meta.url), "utf8");

/** Le SQL sans les commentaires. */
const code = sql
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

function fonction(nom: string): string {
  const debut = code.indexOf(`create or replace function public.${nom}(`);
  expect(debut).toBeGreaterThanOrEqual(0);
  const fin = code.indexOf("$$;", debut);
  return code.slice(debut, fin);
}

describe("migration 0040 : plusieurs locaux par société (3D-7)", () => {
  it("supprime l'unicité de workshops.company_id (0005) et garde un index par société", () => {
    expect(code).toContain("alter table public.workshops drop constraint if exists workshops_company_id_key;");
    expect(code).toContain("create index if not exists workshops_company_id_idx on public.workshops (company_id);");
  });

  it("signer_bail et acheter_local ne refusent plus un 2e local et posent ses postes", () => {
    for (const nom of ["signer_bail", "acheter_local"]) {
      const f = fonction(nom);
      expect(f).not.toContain("local_deja_loue");
      expect(f).not.toContain("local_deja_detenu");
      expect(f).toContain("insert into public.workshops");
      expect(f).toContain("returning id into v_workshop_id;");
      expect(f).toContain(`'${MODULE_POSE_A_LA_SIGNATURE}', 2 + 3 * (i - 1), 1, false`);
      expect(f).toContain("where w.id = v_workshop_id");
    }
  });

  it("les écritures de signature et d'achat portent l'id du local, avec les préfixes lus par la mission 5", () => {
    const bail = fonction("signer_bail");
    expect(bail).toContain("'bail_signature_' || v_workshop_id::text");
    expect(bail).toMatch(/'275', 'debit', p_depot_centimes/);
    expect(bail).toMatch(/'512', 'credit', p_depot_centimes/);
    const achat = fonction("acheter_local");
    expect(achat).toContain("'achat_local_' || v_workshop_id::text");
    expect(achat).toContain("perform public.creer_pret(");
  });

  it("garde les signatures de bail et d'achat (les routes ne changent pas d'appel)", () => {
    expect(code).toMatch(
      /grant execute on function public\.signer_bail\(uuid, text, integer, bigint, bigint, bigint, integer, integer\)\s*to service_role/,
    );
    expect(code).toMatch(
      /grant execute on function public\.acheter_local\(uuid, text, integer, bigint, bigint, bigint, bigint, integer, integer, integer, numeric, integer, timestamptz, bigint, jsonb\)\s*to service_role/,
    );
  });

  it("donner_conge vise un local de la société, et seulement lui", () => {
    expect(code).toContain("drop function if exists public.donner_conge(uuid, integer, integer);");
    const f = fonction("donner_conge");
    expect(f).toContain("p_workshop_id uuid,");
    expect(f).toContain("where w.id = p_workshop_id and w.company_id = p_company_id");
    expect(f).toContain("where id = p_workshop_id and company_id = p_company_id;");
    expect(f).not.toMatch(/where company_id = p_company_id;/);
    expect(code).toContain("grant execute on function public.donner_conge(uuid, uuid, integer, integer) to service_role;");
  });

  it("la fin de bail ne libère que le local dont l'id termine l'écriture de restitution du moteur", () => {
    const f = fonction("appliquer_pas_entreprise");
    expect(f).toContain(`like '${PREFIXE_RESTITUTION_DEPOT.slice(0, -1)}\\_%'`);
    expect(f).toContain("right(x.ecriture_id, length(w.id::text) + 1) = '_' || w.id::text");
    expect(f).not.toMatch(/delete from public\.workshops where company_id = p_company_id;/);
    // Le moteur produit bien « …_<id du local> » en fin d'identifiant.
    const bail = { depotGarantie: centimes(100), chargesMensuelles: centimes(0), moisSignature: moisJeu(0), moisFin: moisJeu(3) };
    const idLocal = "3f0c2b9e-0000-4000-8000-000000000001";
    const e = ecritureRestitutionDepot("ent", moisJeu(3), bail, idLocal)!;
    expect(e.id.startsWith(PREFIXE_RESTITUTION_DEPOT)).toBe(true);
    expect(e.id.endsWith(`_${idLocal}`)).toBe(true);
  });

  it("garde la promotion du plan prévu par local et le reste de appliquer_pas_entreprise (0037)", () => {
    const f = fonction("appliquer_pas_entreprise");
    expect(f).toContain("and w.plan_prevu_mois is not null");
    expect(f).toContain("pas_deja_traite");
    expect(f).toContain("pas_traites = p_pas_attendu + p_nb_pas");
    expect(code).toMatch(
      /grant execute on function public\.appliquer_pas_entreprise\(uuid, integer, jsonb, integer\)\s*to service_role/,
    );
  });

  it("comptes_publics : une ligne par société (plus ancien local), mêmes colonnes", () => {
    const vue = code.slice(code.indexOf("create or replace view public.comptes_publics"));
    expect(vue).not.toContain("left join public.workshops wk on wk.company_id = c.id");
    expect(vue).toContain("order by w2.cree_le, w2.id");
    expect(vue).toContain("limit 1");
    expect(vue).toContain("wk.batiment_id,");
  });

  it("est rejouable et ne supprime aucune donnée à l'application", () => {
    expect(code).toContain("set search_path = public");
    expect(code).not.toMatch(/drop table|truncate|drop column/i);
    // Les seuls delete sont dans appliquer_pas_entreprise (fin de bail, plan prévu), comme en 0037.
    const horsFonctions = code.replace(/\$\$[\s\S]*?\$\$;/g, "");
    expect(horsFonctions).not.toMatch(/delete from/i);
  });
});
