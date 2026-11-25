import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLAN_COMPTABLE_V1 } from "@kapital/engine";

/**
 * Contrôle statique (la base n'est pas exécutée en test) de la migration 0035 :
 * la vue comptes_publics n'expose que l'identité, l'extérieur et les comptes annuels.
 */
const sql = readFileSync(new URL("../../../supabase/migrations/0035_comptes_publics.sql", import.meta.url), "utf8");

/** Le SQL sans les commentaires (le commentaire d'en-tête cite les données privées exclues). */
const code = sql
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

/** La liste blanche validée pour 3D-8 : rien d'autre ne doit sortir de la vue. */
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

/** Colonnes de sortie de la vue : la liste entre le premier `select` et `from public.companies c`. */
function colonnesDeLaVue(): string[] {
  const debut = code.indexOf("create or replace view public.comptes_publics");
  expect(debut).toBeGreaterThanOrEqual(0);
  const apresSelect = code.indexOf("select", debut) + "select".length;
  const fin = code.indexOf("\nfrom public.companies c", apresSelect);
  // Découpe aux virgules de premier niveau (pas celles de coalesce(…, 0)).
  const items: string[] = [];
  let profondeur = 0;
  let courant = "";
  for (const car of code.slice(apresSelect, fin)) {
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

describe("migration 0035 : comptes annuels publics", () => {
  it("n'expose que la liste blanche des colonnes, dans cet ordre", () => {
    expect(colonnesDeLaVue()).toEqual(LISTE_BLANCHE);
  });

  it("n'expose aucune donnée privée (trésorerie, loyer, salariés, prêts, stocks, prix d'achat, propriétaire)", () => {
    const colonnes = colonnesDeLaVue().join(" ");
    for (const interdit of [
      "tresorerie",
      "loyer",
      "charges_mensuelles",
      "depot",
      "mode_detention",
      "prix",
      "apport",
      "salaire",
      "employe",
      "pret",
      "loan",
      "stock",
      "owner",
      "statut",
      "ecriture",
      "libelle",
    ]) {
      expect(colonnes).not.toContain(interdit);
    }
  });

  it("ne lit que les tables nécessaires : aucune table de salariés, prêts, stocks ou commandes", () => {
    const tables = [...code.matchAll(/(?:from|join)\s+public\.(\w+)/g)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(
      new Set(["companies", "worlds", "valeurs_entreprises", "workshops", "ledger_entries"]),
    );
  });

  it("est en lecture seule, réservée aux joueurs connectés (pas anon), sans toucher aux tables", () => {
    expect(code).toMatch(/revoke all on public\.comptes_publics from public, anon, authenticated;/);
    expect(code).toMatch(/grant select on public\.comptes_publics to authenticated, service_role;/);
    expect(code).not.toMatch(/grant (all|insert|update|delete)/i);
    expect(code).not.toMatch(/\b(drop|alter table|create table|insert into|update public|delete from|truncate)\b/i);
    expect(code).toContain("security_barrier = true");
  });

  it("publie le dernier exercice clos (12 mois comptés depuis 0), pas les chiffres du jour", () => {
    expect(code).toContain("case when w.mois_courant >= 12 then (w.mois_courant / 12) - 1 end as numero");
    expect(code).toContain("l.mois_jeu <= ex.numero * 12 + 11");
    expect(code).toMatch(/\) a on ex\.numero is not null/);
  });

  it("calcule le CA sur les comptes 70, le résultat sur 6 et 7, et exclut les sociétés liquidées", () => {
    expect(code).toContain("l.compte like '70%' and l.mois_jeu >= ex.numero * 12");
    expect(code).toContain("(l.compte like '6%' or l.compte like '7%') and l.mois_jeu >= ex.numero * 12");
    expect(code).toContain("where c.statut <> 'liquidee'");
  });

  it("totalise le bilan sur exactement les comptes d'actif du plan comptable du moteur", () => {
    const liste = /l\.compte in \(([^)]*)\)/.exec(code)?.[1] ?? "";
    const comptes = [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
    // 2135 (agencements de la boutique) arrive avec la migration 0038, qui reprend la vue.
    const actifs = PLAN_COMPTABLE_V1.filter((c) => c.type === "actif" && c.numero !== "2135")
      .map((c) => c.numero)
      .sort();
    expect(comptes).toEqual(actifs);
  });
});
