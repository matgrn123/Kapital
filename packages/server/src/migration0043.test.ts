import { readFileSync } from "node:fs";
import { PREMIER_MOIS_CALENDAIRE, indexDuMois } from "@kapital/engine";
import { describe, expect, it } from "vitest";

/** Contrôle statique (la base n'est pas exécutée en test) de la migration 0043. */
const lire = (chemin: string) => readFileSync(new URL(`../../../${chemin}`, import.meta.url), "utf8");
const sql = lire("supabase/migrations/0043_horloge_reelle_remise_a_zero.sql");
const seedPnj = lire("supabase/migrations/0014_seed_pnj.sql");
const workflow = lire(".github/workflows/migrate.yml");

/** Le SQL sans ses commentaires : seules les instructions comptent. */
const instructions = sql
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

describe("migration 0043 : horloge réelle et remise à zéro du monde (T1)", () => {
  it("efface toutes les sociétés (le reste suit en cascade) et l'historique du monde", () => {
    expect(instructions).toMatch(/delete from public\.companies;/);
    expect(instructions).toMatch(/delete from public\.journal_avance;/);
    expect(instructions).toMatch(/delete from public\.clotures;/);
    // Rien d'autre n'est détruit : ni tables, ni colonnes, ni comptes des joueurs.
    expect(instructions).not.toMatch(/drop table|truncate|drop column/i);
    expect(instructions).not.toMatch(/delete from (public\.)?(profiles|audit_log|market_data|worlds)\b/i);
    expect(instructions).not.toMatch(/auth\./);
  });

  it("n'efface qu'une fois : rejouée, elle ne touche plus aux sociétés recréées", () => {
    expect(instructions).toContain(
      "if exists (select 1 from public.reprises_donnees where nom = '0043_horloge_reelle_remise_a_zero') then",
    );
    expect(instructions).toMatch(/insert into public\.reprises_donnees \(nom, detail\)\s*values \(\s*'0043_horloge_reelle_remise_a_zero'/);
    // la suppression est dans le bloc gardé, après le test de la trace
    expect(instructions.indexOf("delete from public.companies")).toBeGreaterThan(
      instructions.indexOf("0043 : remise à zéro déjà faite"),
    );
  });

  it("cale l'origine de l'horloge au 1er janvier 1970 (valeur et défaut)", () => {
    expect(instructions).toContain("alter column debut_reel set default '1970-01-01T00:00:00Z'");
    expect(instructions).toContain("set debut_reel = '1970-01-01T00:00:00Z'");
    expect(Date.parse("1970-01-01T00:00:00Z")).toBe(0);
  });

  it("met le mois courant à l'index calendaire de Paris : année × 12 + mois − 1", () => {
    const formule =
      /extract\(year from \(now\(\) at time zone 'Europe\/Paris'\)\)::integer \* 12\s*\+ extract\(month from \(now\(\) at time zone 'Europe\/Paris'\)\)::integer - 1/g;
    // une fois pour le défaut de la colonne, une fois pour le recalage du monde
    expect(instructions.match(formule)).toHaveLength(2);
    expect(indexDuMois(2026, 11)).toBe(2026 * 12 + 11 - 1);
  });

  it("interdit désormais un mois de l'ancien calendrier, à partir de janvier 1970 (même borne que le moteur)", () => {
    expect(PREMIER_MOIS_CALENDAIRE).toBe(23640);
    expect(instructions).toContain(
      `add constraint worlds_mois_courant_check check (mois_courant >= ${PREMIER_MOIS_CALENDAIRE})`,
    );
    expect(instructions).toContain(
      `add constraint etat_mois_entreprise_mois_check check (mois >= ${PREMIER_MOIS_CALENDAIRE})`,
    );
    // les contraintes viennent après la remise à zéro (les anciennes lignes ne les respectent pas)
    expect(instructions.indexOf("add constraint worlds_mois_courant_check")).toBeGreaterThan(
      instructions.indexOf("update public.worlds"),
    );
  });

  it("écrit l'apport de capital initial au mois de création, et non plus au mois 0", () => {
    const fonction = instructions.slice(instructions.indexOf("create or replace function public.inscrire_apport_initial()"));
    expect(fonction).toContain("select w.mois_courant into v_mois from public.worlds w where w.id = new.world_id;");
    expect(fonction).toContain("(new.id, 'apport_initial', coalesce(v_mois, 0),");
    expect(fonction).toContain("set search_path = public");
    // définie avant la recréation des PNJ, qui la déclenchent
    expect(instructions.indexOf("create or replace function public.inscrire_apport_initial()")).toBeLessThan(
      instructions.indexOf("insert into public.companies"),
    );
  });

  it("recrée les mêmes PNJ que la migration 0014, avec leur catalogue, leur marque et leur stock", () => {
    const noms = (texte: string) => [...texte.matchAll(/\(monde_id, null, '(PNJ_[^']+)', '(\w+)', 'active', (\d+)\)/g)].map((m) => m.slice(1).join("|"));
    expect(noms(seedPnj)).toHaveLength(20);
    expect(noms(instructions)).toEqual(noms(seedPnj));
    for (const produit of ["prod_tshirt", "prod_chemise", "prod_sac_toile"]) {
      expect(instructions).toContain(`(pnj.id, '${produit}', 60,`);
    }
    expect(instructions).toContain("set quantite_pieces = 2000, valeur_totale_centimes = 2000 * 1500");
    expect(instructions.match(/insert into public\.brand_state/g)).toHaveLength(3);
  });
});

describe("migration 0043 : bascule sans que l'ancien code touche le monde remis à zéro", () => {
  it("porte le marqueur qui la fait appliquer après la mise en ligne du nouveau code", () => {
    expect(sql).toContain("-- kapital:apres-deploiement");
  });

  it("le workflow de migration attend le déploiement Vercel pour une migration marquée", () => {
    const etape = workflow.indexOf("Attendre la mise en ligne Vercel");
    expect(etape).toBeGreaterThan(-1);
    expect(etape).toBeLessThan(workflow.indexOf("supabase db push --remote --yes"));
    expect(workflow).toContain('grep -l "kapital:apres-deploiement"');
    expect(workflow).toContain('select(.context | startswith("Vercel"))');
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toMatch(/statuses: read/);
  });
});
