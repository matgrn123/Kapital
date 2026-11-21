import { describe, expect, it } from "vitest";
import {
  calculerValeurEntreprise,
  ordonnerClassement,
  type EntreeClassement,
} from "./calculer.js";
import type { EcritureClassement } from "./types.js";

function e(
  compte: string,
  sens: "debit" | "credit",
  montant: number,
): EcritureClassement {
  return { compte, sens, montant_centimes: montant };
}

describe("calculerValeurEntreprise", () => {
  it("retourne zéro sur une entreprise sans écriture", () => {
    const v = calculerValeurEntreprise([]);
    expect(v.actif_centimes).toBe(0);
    expect(v.passif_externe_centimes).toBe(0);
    expect(v.valeur_centimes).toBe(0);
  });

  it("additionne les actifs : 20 000 € en banque (apport)", () => {
    const v = calculerValeurEntreprise([
      e("512", "debit", 2_000_000),
      e("101", "credit", 2_000_000),
    ]);
    expect(v.actif_centimes).toBe(2_000_000);
    expect(v.passif_externe_centimes).toBe(0);
    expect(v.valeur_centimes).toBe(2_000_000);
  });

  it("déduit les passifs externes : dette fournisseur de 5 000 €", () => {
    const v = calculerValeurEntreprise([
      e("512", "debit", 2_000_000),
      e("101", "credit", 2_000_000),
      e("31", "debit", 500_000),
      e("401", "credit", 500_000),
    ]);
    expect(v.actif_centimes).toBe(2_500_000);
    expect(v.passif_externe_centimes).toBe(500_000);
    expect(v.valeur_centimes).toBe(2_000_000);
  });

  it("ignore les comptes de charges et produits (hors bilan)", () => {
    const v = calculerValeurEntreprise([
      e("641", "debit", 100_000),
      e("707", "credit", 300_000),
    ]);
    expect(v.valeur_centimes).toBe(0);
  });

  it("gère les contre-passations (sens inverse)", () => {
    const v = calculerValeurEntreprise([
      e("512", "debit", 1_000_000),
      e("512", "credit", 200_000),
    ]);
    expect(v.actif_centimes).toBe(800_000);
  });
});

describe("ordonnerClassement", () => {
  const entrees: EntreeClassement[] = [
    { company_id: "a", nom: "Alpha", pseudo: "al", gamme: "milieu", valeur_centimes: 1_000_000 },
    { company_id: "b", nom: "Beta", pseudo: "be", gamme: "entree", valeur_centimes: 3_000_000 },
    { company_id: "c", nom: "Gamma", pseudo: "ga", gamme: "haut", valeur_centimes: 3_000_000 },
  ];

  it("trie par valeur décroissante", () => {
    const r = ordonnerClassement(entrees);
    expect(r.map((l) => l.company_id)).toEqual(["b", "c", "a"]);
    expect(r[0]?.rang).toBe(1);
    expect(r[2]?.rang).toBe(3);
  });

  it("tie-break alphabétique sur le nom à valeur égale", () => {
    const r = ordonnerClassement(entrees);
    expect(r[0]?.nom).toBe("Beta");
    expect(r[1]?.nom).toBe("Gamma");
  });
});
