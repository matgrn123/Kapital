import { readFileSync } from "node:fs";
import { centimes, idEntreprise, type Entreprise } from "@kapital/engine";
import { describe, expect, it } from "vitest";
import type { ResultatLotAEnregistrer } from "./avance/port.js";
import { chargeUtileDepuisLot } from "./avance/stockageSupabase.js";

/** Contrôle statique (la base n'est pas exécutée en test) de la migration 0045 (lot T3). */
const dossier = new URL("../../../supabase/migrations/", import.meta.url);
const lire = (nom: string) => readFileSync(new URL(nom, dossier), "utf8");
const sansCommentaires = (sql: string) =>
  sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

const sql = lire("0045_travaux_instantanes.sql");
const code = sansCommentaires(sql);

/** Corps d'une fonction : la n-ième définition de `nom` (0 = la première). */
function fonction(source: string, nom: string, rang = 0): string {
  let debut = -1;
  for (let i = 0; i <= rang; i++) {
    debut = source.indexOf(`create or replace function public.${nom}(`, debut + 1);
    expect(debut).toBeGreaterThanOrEqual(0);
  }
  return source.slice(debut, source.indexOf("$$;", debut));
}

const espaces = (s: string) => s.replace(/\s+/g, " ").trim();

describe("migration 0045 : travaux et aménagement en heures réelles (T3)", () => {
  it("ajoute les deux instants : ouverture de la boutique et mise en place du plan", () => {
    expect(code).toContain("alter table public.points_de_vente add column if not exists ouverture_le timestamptz;");
    expect(code).toContain("alter table public.workshops add column if not exists plan_prevu_le timestamptz;");
  });

  it("ouvrir_boutique enregistre l'instant d'ouverture ; l'ancienne signature l'appelle sans instant", () => {
    const nouvelle = fonction(code, "ouvrir_boutique", 0);
    expect(nouvelle).toContain("p_ouverture_le timestamptz");
    expect(espaces(nouvelle)).toContain("p_mois_signature, p_mois_ouverture, p_ouverture_le)");
    // Les deux écritures d'ouverture ne changent pas (275 / 512 et 2135 / 512).
    expect(nouvelle).toContain("'boutique_depot_' || v_id::text");
    expect(nouvelle).toContain("'boutique_travaux_' || v_id::text");
    expect(nouvelle).toMatch(/'2135', 'debit', p_travaux_centimes\),[\s\S]*'512', 'credit', p_travaux_centimes\)/);
    const ancienne = fonction(code, "ouvrir_boutique", 1);
    expect(ancienne).not.toContain("p_ouverture_le timestamptz");
    expect(espaces(ancienne)).toContain("p_mois_ouverture, null::timestamptz");
    for (const signature of [
      "uuid, text, integer, bigint, bigint, bigint, bigint, integer, integer, integer, timestamptz",
      "uuid, text, integer, bigint, bigint, bigint, bigint, integer, integer, integer",
    ]) {
      expect(espaces(code)).toContain(
        `revoke all on function public.ouvrir_boutique(${signature}) from public, anon, authenticated;`,
      );
      expect(espaces(code)).toContain(`grant execute on function public.ouvrir_boutique(${signature}) to service_role;`);
    }
  });

  it("sauvegarder_amenagement enregistre l'heure de mise en place ; l'ancienne signature l'appelle sans heure", () => {
    const nouvelle = fonction(code, "sauvegarder_amenagement", 0);
    expect(nouvelle).toContain("p_prevu_le timestamptz");
    expect(espaces(nouvelle)).toContain(
      "set plan_prevu_mois = p_mois_jeu, plan_prevu_le = p_prevu_le, plan_prevu_cout_centimes = p_cout_centimes",
    );
    // Écritures inchangées : achat 2154 / 512, contre-passation 512 / 2154 du plan remplacé.
    expect(nouvelle).toMatch(/'2154', 'debit', p_cout_centimes\)/);
    expect(nouvelle).toMatch(/'2154', 'credit', v_cout_precedent\)/);
    const ancienne = fonction(code, "sauvegarder_amenagement", 1);
    expect(espaces(ancienne)).toContain("p_mois_jeu, p_ecriture_id, null::timestamptz");
    expect(espaces(code)).toContain(
      "grant execute on function public.sauvegarder_amenagement(uuid, uuid, jsonb, bigint, integer, text, timestamptz) to service_role;",
    );
    expect(espaces(code)).toContain(
      "grant execute on function public.sauvegarder_amenagement(uuid, uuid, jsonb, bigint, integer, text) to service_role;",
    );
  });

  it("appliquer_pas_entreprise met le plan prévu en service à son heure, à la fin du lot", () => {
    const f = espaces(fonction(code, "appliquer_pas_entreprise"));
    expect(f).toContain("v_fin_lot timestamptz := coalesce(nullif(coalesce(p_etat, '{}'::jsonb)->>'instant_fin_lot', '')::timestamptz, now());");
    const condition =
      "and w.plan_prevu_mois is not null and ((w.plan_prevu_le is not null and w.plan_prevu_le <= v_fin_lot) or (w.plan_prevu_le is null and v_cloture))";
    // Les trois instructions (retrait du plan en service, plan prévu actif, remise à zéro) ont la même condition.
    expect(f.split(condition)).toHaveLength(4);
    expect(f).toContain("set plan_prevu_mois = null, plan_prevu_le = null, plan_prevu_cout_centimes = 0");
    // Plus de mise en place réservée à la clôture.
    expect(f).not.toContain("if (v_etat->'entreprise') ? 'mois_decouvert_consecutifs' then");
  });

  it("la clé de la charge utile est celle que rend le serveur (instant_fin_lot)", () => {
    const entreprise = {
      id: idEntreprise("e"),
      stocksMatiere: [],
      stocksFinis: [],
      prets: [],
      marque: { notoriete: 0, desirabilite: 0 },
      statut: "active",
      etape: 0,
      tresorerie: centimes(0),
    } as unknown as Entreprise;
    const lot = {
      entreprise,
      ecritures: [],
      echeancesPayees: [],
      commandesMatiereLivrees: [],
      ordresFaconnierLivres: [],
      moisDecouvertConsecutifs: null,
      cumul: null,
      finDuLotMs: 0,
    } satisfies ResultatLotAEnregistrer;
    expect(Object.keys(chargeUtileDepuisLot(lot))).toContain("instant_fin_lot");
  });

  it("hors mise en place du plan, appliquer_pas_entreprise est identique à la version de 0040", () => {
    const sansPlan = (f: string) => {
      const debut = f.indexOf("delete from public.placed_modules pm");
      const fin = f.indexOf("delete from public.workshops w");
      return espaces(f.slice(0, debut) + f.slice(fin))
        .replace(/ v_cloture boolean := [^;]*;/, "")
        .replace(/ v_fin_lot timestamptz := [^;]*;/, "")
        .replace(/ if \(v_etat->'entreprise'\) \? 'mois_decouvert_consecutifs' then/, "")
        .replace(/ end if; delete from public\.workshops w/, " delete from public.workshops w");
    };
    const avant = sansPlan(fonction(sansCommentaires(lire("0040_multi_locaux.sql")), "appliquer_pas_entreprise"));
    const apres = sansPlan(fonction(code, "appliquer_pas_entreprise"));
    expect(apres).toBe(avant);
    expect(espaces(code)).toContain(
      "grant execute on function public.appliquer_pas_entreprise(uuid, integer, jsonb, integer) to service_role;",
    );
  });

  it("aucune durée écrite en SQL (elles viennent des paramètres), rejouable, ne détruit aucune donnée", () => {
    expect(code).not.toMatch(/interval/i);
    expect(code).not.toMatch(/drop table|drop column|truncate|drop function/i);
    expect(code.match(/add column if not exists/g)).toHaveLength(2);
    expect(code).toContain("set search_path = public");
  });
});
