import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Contrôle statique (la base n'est pas exécutée en test) de la migration 0030. */
const sql = readFileSync(
  new URL("../../../supabase/migrations/0030_reglement_fournisseurs.sql", import.meta.url),
  "utf8",
);

describe("migration 0030 : règlement des fournisseurs et façonniers", () => {
  it("ajoute des colonnes sans rien supprimer", () => {
    expect(sql).not.toMatch(/drop table|drop column|delete from/i);
    expect(sql).toMatch(/purchase_orders\s+add column if not exists mois_jeu_reglement integer/);
    expect(sql).toMatch(/add column if not exists mois_jeu_reglement integer,/);
    expect(sql).toContain("add column if not exists fournit_matiere boolean not null default false");
    expect(sql).toContain("add column if not exists fournitures_facturees boolean not null default true");
  });

  it("le grossiste fournit tout ; les ordres déjà livrés n'ont pas eu de fournitures facturées", () => {
    expect(sql).toMatch(/set fournit_matiere = true where id = 'gros_local'/);
    expect(sql).toMatch(/set fournitures_facturees = false\s+where statut = 'livree'/);
  });

  it("annule les ordres atelier en cours, jamais lus par le moteur", () => {
    expect(sql).toMatch(/set statut = 'annulee'\s+where lieu_type = 'atelier' and statut = 'en_cours'/);
  });

  it("marque la commande payée dans la transaction de l'écriture de règlement 401 débit", () => {
    expect(sql).toMatch(/after insert on public\.ledger_entries/);
    expect(sql).toContain("new.compte <> '401' or new.sens <> 'debit'");
    // Mêmes préfixes que le moteur (flux.ts : reglement_<nature>_<ordreId>)
    expect(sql).toContain("reglement\\_matiere\\_%");
    expect(sql).toContain("reglement\\_faconnier\\_%");
    expect(sql).toMatch(/where company_id = new\.company_id/);
  });

  it("la fonction du déclencheur n'est pas appelable par les joueurs", () => {
    expect(sql).toMatch(/revoke all on function public\.suivre_reglement_fournisseur\(\) from public, anon, authenticated/);
  });
});
