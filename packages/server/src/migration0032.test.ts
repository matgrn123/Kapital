import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Contrôle statique (la base n'est pas exécutée en test) de la migration 0032. */
const sql = readFileSync(
  new URL("../../../supabase/migrations/0032_ventes_bon_mois.sql", import.meta.url),
  "utf8",
);

// Reprend le filtre de la migration pour l'éprouver sur des identifiants réels.
const motif = /'(\^\(vente\|[^']+)'/.exec(sql)![1]!;
const extraction = /substring\(le\.ecriture_id from '([^']+)'\)/.exec(sql)![1]!;
const estRepris = (ecritureId: string, moisJeu: number): boolean => {
  if (moisJeu < 1 || !new RegExp(motif).test(ecritureId)) return false;
  const m = new RegExp(extraction).exec(ecritureId);
  return m !== null && Number(m[1]) === moisJeu;
};

describe("migration 0032 : écritures au bon mois", () => {
  it("décale les écritures de l'avance du monde (préfixe moteur + mois égal à mois_jeu)", () => {
    const uuid = "3f2a1c9e-1111-4222-8333-944455556666";
    for (const id of [
      `vente_11_${uuid}_prod_tshirt_vente_directe_p12`,
      `retour_11_${uuid}_prod_tshirt_p3`,
      `encaissement_11_vente_9_${uuid}_prod_tshirt_revendeur_p5`,
      `livraison_mat_11_${uuid}`,
      `livraison_fac_11_${uuid}`,
      `production_atelier_11_${uuid}_prod_tshirt_p0`,
      `salaire_11_${uuid}`,
      `salaire_pmt_11_${uuid}`,
      `echeance_11_${uuid}`,
      `tva_declaration_11_${uuid}`,
      `amort_construction_11_${uuid}`,
      `bail_restitution_11_${uuid}`,
      `is_pmt_11_${uuid}`,
    ]) {
      expect(estRepris(id, 11), id).toBe(true);
    }
  });

  it("ne touche jamais une écriture de route, ni une écriture déjà au bon mois", () => {
    const uuid = "12345678-1111-4222-8333-944455556666";
    expect(estRepris(`pret_${uuid}`, 4)).toBe(false);
    expect(estRepris(`bail_signature_${uuid}`, 4)).toBe(false);
    expect(estRepris(`achat_local_${uuid}`, 4)).toBe(false);
    expect(estRepris(`pret_achat_4_${uuid}`, 4)).toBe(false);
    expect(estRepris(`licenciement_4_${uuid}`, 4)).toBe(false);
    expect(estRepris(`marketing_4_${uuid}`, 4)).toBe(false);
    expect(estRepris("serie_lancement_prod_tshirt", 4)).toBe(false);
    expect(estRepris(`echeance_${uuid}_3`, 4)).toBe(false); // échéance d'événement daté
    // mois différent de celui de l'identifiant : déjà repris, ou écrit après le correctif ailleurs
    expect(estRepris(`vente_11_${uuid}_prod_tshirt_vente_directe_p1`, 10)).toBe(false);
    expect(estRepris(`vente_0_${uuid}_prod_tshirt_vente_directe_p1`, 0)).toBe(false);
  });

  it("ne se joue qu'une fois, sous verrou, et décale aussi l'état du mois en cours", () => {
    expect(sql).toContain("reprises_donnees where nom = '0032_ventes_bon_mois'");
    expect(sql).toMatch(/lock table public\.ledger_entries, public\.etat_mois_entreprise, public\.companies/);
    expect(sql).toMatch(/set mois = e\.mois - 1/);
    expect(sql).toMatch(/jsonb_set\(e\.cumul, '\{mois\}'/);
  });

  it("ajoute aux compteurs d'étape les ventes du mois en cours déjà passées", () => {
    expect(sql).toMatch(/pieces_vendues_total = c\.pieces_vendues_total \+/);
    expect(sql).toMatch(/chiffre_affaires_cumule_ht_centimes = c\.chiffre_affaires_cumule_ht_centimes/);
  });

  it("ne supprime rien", () => {
    expect(sql).not.toMatch(/\bdrop\b|\bdelete\b|\btruncate\b/i);
  });
});
