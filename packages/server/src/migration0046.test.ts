import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { indexDuMois, moisCalendaire } from "@kapital/engine";

/**
 * Contrôle statique (la base n'est pas exécutée en test) de la migration 0046 :
 * comptes publics sur l'exercice civil, NULL pour une société qui n'existait pas à sa clôture.
 */
const sql = readFileSync(
  new URL("../../../supabase/migrations/0046_comptes_publics_exercice_civil.sql", import.meta.url),
  "utf8",
);

/** Le SQL sans les commentaires. */
const code = sql
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

const vue = code.slice(code.indexOf("create or replace view public.comptes_publics"));

/** Même liste blanche que 0035 / 0038 / 0040, dans le même ordre (create or replace view l'exige). */
const LISTE_BLANCHE = [
  "company_id",
  "nom",
  "gamme",
  "etape",
  "valeur_centimes",
  "batiment_id",
  "exercice",
  "exercice_mois_debut",
  "exercice_mois_fin",
  "chiffre_affaires_ht_centimes",
  "resultat_centimes",
  "total_bilan_centimes",
];

function colonnesDeLaVue(): string[] {
  const apresSelect = vue.indexOf("select") + "select".length;
  const fin = vue.indexOf("\nfrom public.companies c", apresSelect);
  const items: string[] = [];
  let profondeur = 0;
  let courant = "";
  for (const car of vue.slice(apresSelect, fin)) {
    if (car === "(") profondeur++;
    if (car === ")") profondeur--;
    if (car === "," && profondeur === 0) {
      items.push(courant);
      courant = "";
    } else courant += car;
  }
  items.push(courant);
  return items
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => item.split(/\s+as\s+|\s+|\./).at(-1)!);
}

describe("migration 0046 : comptes publics sur l'exercice civil", () => {
  it("garde la liste blanche des colonnes, dans le même ordre", () => {
    expect(colonnesDeLaVue()).toEqual(LISTE_BLANCHE);
  });

  it("le dernier exercice clos est l'année civile précédente (index calendaire)", () => {
    expect(vue).toContain("then (w.mois_courant / 12) - 1");
    // Novembre 2026 (24322) : l'exercice 2025 est le dernier clos, de janvier à décembre 2025.
    const moisCourant = indexDuMois(2026, 11);
    const numero = Math.trunc(moisCourant / 12) - 1;
    expect(numero).toBe(2025);
    expect(numero * 12).toBe(indexDuMois(2025, 1));
    expect(numero * 12 + 11).toBe(indexDuMois(2025, 12));
    expect(moisCalendaire(numero * 12 + 11)).toEqual({ annee: 2025, mois: 12 });
    // Janvier 2027 : l'exercice 2026 vient d'être clos.
    expect(Math.trunc(indexDuMois(2027, 1) / 12) - 1).toBe(2026);
  });

  it("NULL si la société n'existait pas à la fin de l'exercice (première écriture après décembre)", () => {
    expect(vue).toContain("select min(l0.mois_jeu) as premier_mois");
    expect(vue).toMatch(/cr\.premier_mois is not null\s+and cr\.premier_mois <= \(\(w\.mois_courant \/ 12\) - 1\) \* 12 \+ 11/);
    expect(vue).toMatch(/\) a on ex\.numero is not null/);
    // Le numéro n'est plus calculé pour toutes les sociétés, comme en 0035 / 0040.
    expect(vue).not.toContain("case when w.mois_courant >= 12 then (w.mois_courant / 12) - 1 end as numero");
  });

  it("premier exercice raccourci : il commence au mois de création de la société", () => {
    expect(vue).toContain(
      "case when ex.numero is not null then greatest(ex.numero * 12, cr.premier_mois) end as exercice_mois_debut",
    );
    expect(vue).toContain("ex.numero * 12 + 11 as exercice_mois_fin");
  });

  it("mêmes calculs que 0040 : CA (70), résultat (6 et 7), bilan (actif, 2135 compris), un local par société", () => {
    expect(vue).toContain("l.compte like '70%' and l.mois_jeu >= ex.numero * 12");
    expect(vue).toContain("(l.compte like '6%' or l.compte like '7%') and l.mois_jeu >= ex.numero * 12");
    expect(vue).toContain("l.compte in ('213', '2135', '2154', '275', '31', '35', '411', '44566', '512')");
    expect(vue).toContain("l.mois_jeu <= ex.numero * 12 + 11");
    expect(vue).toContain("order by w2.cree_le, w2.id");
    expect(vue).toContain("where c.statut <> 'liquidee'");
  });

  it("ne lit que les tables nécessaires", () => {
    const tables = [...vue.matchAll(/(?:from|join)\s+public\.(\w+)/g)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(
      new Set(["companies", "worlds", "valeurs_entreprises", "workshops", "ledger_entries"]),
    );
  });

  it("lecture seule, réservée aux joueurs connectés, rejouable, sans toucher aux données", () => {
    expect(code).toContain("security_barrier = true");
    expect(code).toMatch(/revoke all on public\.comptes_publics from public, anon, authenticated;/);
    expect(code).toMatch(/grant select on public\.comptes_publics to authenticated, service_role;/);
    expect(code).not.toMatch(/grant (all|insert|update|delete)/i);
    expect(code).not.toMatch(/\b(drop|alter table|create table|insert into|update public|delete from|truncate)\b/i);
  });
});
