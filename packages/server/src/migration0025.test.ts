import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Contrôle statique (la base n'est pas exécutée en test) : la migration 0025 remplace
 * appliquer_pas_entreprise sans perdre les garanties de 0020, et ajoute l'étape et les compteurs.
 */
const lire = (f: string) =>
  readFileSync(new URL(`../../../supabase/migrations/${f}`, import.meta.url), "utf8");

describe("migration 0025 : étapes", () => {
  const m0020 = lire("0020_horloge_commune.sql");
  const m0025 = lire("0025_etapes.sql");

  it("remplace la fonction par create or replace, même signature", () => {
    expect(m0025).toMatch(/create or replace function public\.appliquer_pas_entreprise\(/);
  });

  it("conserve verrou de ligne, erreurs métier et droits de 0020", () => {
    for (const motif of ["for update", "KP400", "KP404", "KP409"]) {
      expect(m0020).toContain(motif);
      expect(m0025).toContain(motif);
    }
    expect(m0025).toMatch(/revoke all on function public\.appliquer_pas_entreprise/);
    expect(m0025).toMatch(/grant execute on function public\.appliquer_pas_entreprise/);
  });

  it("persiste l'étape sans jamais la baisser, et les deux compteurs cumulés", () => {
    expect(m0025).toMatch(/etape = greatest\(/);
    expect(m0025).toContain("pieces_vendues_total");
    expect(m0025).toContain("chiffre_affaires_cumule_ht_centimes");
    expect(m0025).toMatch(/check \(pieces_vendues_total >= 0\)/);
    expect(m0025).toMatch(/check \(chiffre_affaires_cumule_ht_centimes >= 0\)/);
  });

  it("ne touche pas la contrainte etape (0 à 2)", () => {
    expect(m0025).not.toMatch(/companies_etape/);
  });
});
