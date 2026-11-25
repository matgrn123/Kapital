import { describe, expect, it } from "vitest";
import { besoinFondsRoulementDepuisLignes, bornesPrix } from "./vente";

const l = (id: string, compte: string, sens: "debit" | "credit", montant: number) => ({
  ecriture_id: id,
  mois_jeu: 0,
  libelle: "x",
  compte,
  sens,
  montant_centimes: montant,
});

describe("bornesPrix", () => {
  it("part du prix sans perte et va jusqu'au double du plus haut des deux", () => {
    // coût 1000, TVA 20 % : sous 1200 TTC on vend à perte.
    expect(bornesPrix({ coutRevient: 1000, prixActuel: 2000, tauxTva: 0.2 })).toEqual({ min: 1200, max: 4000 });
  });
  it("garde le prix actuel dans les bornes même s'il est sous le coût", () => {
    const b = bornesPrix({ coutRevient: 1000, prixActuel: 900, tauxTva: 0.2 });
    expect(b.min).toBe(900);
    expect(b.max).toBe(2400);
  });
  it("sans coût connu, part de zéro", () => {
    expect(bornesPrix({ coutRevient: null, prixActuel: 1500, tauxTva: 0.2 })).toEqual({ min: 0, max: 3000 });
  });
});

describe("besoinFondsRoulementDepuisLignes", () => {
  it("additionne stocks et créances, retire les dettes fournisseurs (calcul du moteur)", () => {
    const b = besoinFondsRoulementDepuisLignes([
      l("a", "31", "debit", 50_000),
      l("a", "401", "credit", 50_000),
      l("b", "35", "debit", 20_000),
      l("b", "512", "credit", 20_000),
      l("c", "411", "debit", 12_000),
      l("c", "701", "credit", 12_000),
      l("d", "401", "debit", 10_000),
      l("d", "512", "credit", 10_000),
    ]);
    expect(b).toEqual({ stocks: 70_000, creances: 12_000, dettesFournisseurs: 40_000, besoin: 42_000 });
  });
  it("vaut zéro sans écriture", () => {
    expect(besoinFondsRoulementDepuisLignes([]).besoin).toBe(0);
  });
});
