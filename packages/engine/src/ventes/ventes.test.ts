import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import {
  enEquilibre,
  planComptableV1,
  resultat,
  soldeCompte,
} from "../comptabilite/index.js";
import { centimes, idProduit, moisJeu } from "../types/primitifs.js";
import {
  enregistrerRetour,
  enregistrerVenteDirecte,
  enregistrerVenteRevendeur,
  margeRevendeur,
  margeVenteDirecte,
  prixHtDepuisTtc,
  prixTtcDepuisHt,
  tvaSurPrixTtc,
} from "./index.js";

const TSHIRT = idProduit("prod_tshirt");

function params() {
  return chargerParametresV1();
}

describe("prixHtDepuisTtc et tvaSurPrixTtc", () => {
  it("60 € TTC → 50 € HT, 10 € TVA à 20 %", () => {
    expect(prixHtDepuisTtc(centimes(6000), 0.2)).toBe(5000);
    expect(tvaSurPrixTtc(centimes(6000), 0.2)).toBe(1000);
  });
});

describe("critère T10 : marge revendeur < marge vente directe", () => {
  it("avec paramètres V1, marge revendeur est inférieure à marge directe", () => {
    const p = params();
    const tauxRetour = p["taux_retour_vente_en_ligne"]!.valeur;
    const coutRetour = p["cout_traitement_retour"]!.valeur;
    const tva = p["tva_standard"]!.valeur;

    const coutRevient = centimes(2000);
    const prixTtcDirect = centimes(6000);
    const prixGrosHt = centimes(3000);

    const directe = margeVenteDirecte({
      prixTtcUnitaire: prixTtcDirect,
      coutRevientUnitaire: coutRevient,
      tauxTva: tva,
      tauxRetour,
      coutTraitementRetourUnitaire: centimes(coutRetour),
    });
    const revendeur = margeRevendeur({
      prixGrosHtUnitaire: prixGrosHt,
      coutRevientUnitaire: coutRevient,
    });
    expect(revendeur).toBeLessThan(directe);
  });

  it("marge revendeur avec prix de gros à moitié du prix public reste positive si coût bas", () => {
    const revendeur = margeRevendeur({
      prixGrosHtUnitaire: centimes(3000),
      coutRevientUnitaire: centimes(1000),
    });
    expect(revendeur).toBe(2000);
  });

  it("marge directe prend en compte les retours (19 %)", () => {
    const p = params();
    const sansRetour = margeVenteDirecte({
      prixTtcUnitaire: centimes(6000),
      coutRevientUnitaire: centimes(2000),
      tauxTva: 0.20,
      tauxRetour: 0,
      coutTraitementRetourUnitaire: centimes(1750),
    });
    const avecRetour = margeVenteDirecte({
      prixTtcUnitaire: centimes(6000),
      coutRevientUnitaire: centimes(2000),
      tauxTva: 0.20,
      tauxRetour: p["taux_retour_vente_en_ligne"]!.valeur,
      coutTraitementRetourUnitaire: centimes(1750),
    });
    expect(avecRetour).toBeLessThan(sansRetour);
  });
});

describe("enregistrerVenteDirecte — écriture comptable", () => {
  it("passe 512 débit TTC, 707 crédit HT, 44571 crédit TVA, 7135 débit coût, 35 crédit coût", () => {
    const gl = enregistrerVenteDirecte(planComptableV1(), {
      idEcriture: "v1",
      mois: moisJeu(0),
      produit: TSHIRT,
      quantite: 100,
      prixTtcUnitaire: centimes(6000),
      coutRevientUnitaire: centimes(2000),
      tauxTva: 0.20,
    });
    expect(soldeCompte(gl, "512")).toBe(600_000);
    expect(soldeCompte(gl, "707")).toBe(500_000);
    expect(soldeCompte(gl, "44571")).toBe(100_000);
    expect(soldeCompte(gl, "35")).toBe(-200_000);
    expect(soldeCompte(gl, "7135")).toBe(-200_000);
    expect(enEquilibre(gl)).toBe(true);
  });

  it("refuse une quantité à zéro", () => {
    expect(() =>
      enregistrerVenteDirecte(planComptableV1(), {
        idEcriture: "v",
        mois: moisJeu(0),
        produit: TSHIRT,
        quantite: 0,
        prixTtcUnitaire: centimes(6000),
        coutRevientUnitaire: centimes(2000),
        tauxTva: 0.20,
      }),
    ).toThrow(/positive/);
  });
});

describe("enregistrerVenteRevendeur", () => {
  it("prix saisi HT plus TVA : 411 débit TTC, 707 crédit HT, 44571 crédit TVA, 7135 / 35 au coût", () => {
    // Critère d'acceptation : 30,00 € HT × 10 pièces à 20 %
    const gl = enregistrerVenteRevendeur(planComptableV1(), {
      idEcriture: "r1",
      mois: moisJeu(0),
      produit: TSHIRT,
      quantite: 10,
      prixGrosHtUnitaire: centimes(3000),
      coutRevientUnitaire: centimes(2000),
      tauxTva: 0.2,
    });
    expect(soldeCompte(gl, "707")).toBe(30_000);
    expect(soldeCompte(gl, "44571")).toBe(6_000);
    expect(soldeCompte(gl, "411")).toBe(36_000);
    expect(gl.ecritures.at(-1)!.lignes).toEqual([
      { compte: "411", sens: "debit", montant: 36_000 },
      { compte: "707", sens: "credit", montant: 30_000 },
      { compte: "44571", sens: "credit", montant: 6_000 },
      { compte: "7135", sens: "debit", montant: 20_000 },
      { compte: "35", sens: "credit", montant: 20_000 },
    ]);
    expect(enEquilibre(gl)).toBe(true);
  });

  it("la TVA est calculée sur le total HT de la facture, arrondie au centime ; 411 = 707 + 44571", () => {
    // 12,34 € HT × 7 = 86,38 € HT ; TVA 20 % = 17,276 € → 17,28 € ; TTC 103,66 €
    const gl = enregistrerVenteRevendeur(planComptableV1(), {
      idEcriture: "r2",
      mois: moisJeu(0),
      produit: TSHIRT,
      quantite: 7,
      prixGrosHtUnitaire: centimes(1234),
      coutRevientUnitaire: centimes(500),
      tauxTva: 0.2,
    });
    expect(soldeCompte(gl, "707")).toBe(8_638);
    expect(soldeCompte(gl, "44571")).toBe(1_728);
    expect(soldeCompte(gl, "411")).toBe(10_366);
    expect(enEquilibre(gl)).toBe(true);
  });

  it("sans TVA (taux 0), aucune ligne 44571", () => {
    const gl = enregistrerVenteRevendeur(planComptableV1(), {
      idEcriture: "r3",
      mois: moisJeu(0),
      produit: TSHIRT,
      quantite: 100,
      prixGrosHtUnitaire: centimes(3000),
      coutRevientUnitaire: centimes(2000),
      tauxTva: 0,
    });
    expect(soldeCompte(gl, "411")).toBe(300_000);
    expect(soldeCompte(gl, "707")).toBe(300_000);
    expect(gl.ecritures.at(-1)!.lignes.some((l) => l.compte === "44571")).toBe(false);
    expect(enEquilibre(gl)).toBe(true);
  });
});

describe("prixTtcDepuisHt", () => {
  it("30 € HT → 36 € TTC à 20 % ; 12,96 € HT → 15,55 € TTC (arrondi au centime)", () => {
    expect(prixTtcDepuisHt(centimes(3000), 0.2)).toBe(3600);
    expect(prixTtcDepuisHt(centimes(1296), 0.2)).toBe(1555);
  });
});

describe("enregistrerRetour", () => {
  it("inverse une vente puis ajoute le coût de traitement", () => {
    let gl = enregistrerVenteDirecte(planComptableV1(), {
      idEcriture: "v1",
      mois: moisJeu(0),
      produit: TSHIRT,
      quantite: 100,
      prixTtcUnitaire: centimes(6000),
      coutRevientUnitaire: centimes(2000),
      tauxTva: 0.20,
    });
    gl = enregistrerRetour(gl, {
      idEcriture: "r1",
      mois: moisJeu(0),
      produit: TSHIRT,
      quantiteRetournee: 19,
      prixTtcUnitaire: centimes(6000),
      coutRevientUnitaire: centimes(2000),
      coutTraitementRetourUnitaire: centimes(1750),
      tauxTva: 0.20,
    });
    expect(enEquilibre(gl)).toBe(true);
    expect(soldeCompte(gl, "6228")).toBe(19 * 1750);
    expect(soldeCompte(gl, "512")).toBe(600_000 - 19 * 6000 - 19 * 1750);
    expect(soldeCompte(gl, "707")).toBe(500_000 - 19 * 5000);
  });
});

describe("scénario complet : vente puis retour 19 %", () => {
  it("résultat net inclut la perte sur retours", () => {
    const p = params();
    const tauxRetour = p["taux_retour_vente_en_ligne"]!.valeur;
    const coutRetour = p["cout_traitement_retour"]!.valeur;

    let gl = enregistrerVenteDirecte(planComptableV1(), {
      idEcriture: "v",
      mois: moisJeu(0),
      produit: TSHIRT,
      quantite: 100,
      prixTtcUnitaire: centimes(6000),
      coutRevientUnitaire: centimes(2000),
      tauxTva: 0.20,
    });
    gl = enregistrerRetour(gl, {
      idEcriture: "r",
      mois: moisJeu(0),
      produit: TSHIRT,
      quantiteRetournee: Math.round(100 * tauxRetour),
      prixTtcUnitaire: centimes(6000),
      coutRevientUnitaire: centimes(2000),
      coutTraitementRetourUnitaire: centimes(coutRetour),
      tauxTva: 0.20,
    });
    expect(enEquilibre(gl)).toBe(true);
    expect(resultat(gl)).toBeGreaterThan(0);
  });
});

describe("coût de sortie du stock à la vente", () => {
  it("la vente crédite le 35 du coût total sorti du stock quand il est fourni (pas unitaire arrondi × quantité)", () => {
    // Coût moyen 3,335 € : 3 pièces sortent pour 10,01 €, alors que 3,34 × 3 = 10,02 €.
    const gl = enregistrerVenteDirecte(planComptableV1(), {
      idEcriture: "v1",
      mois: moisJeu(0),
      produit: idProduit("prod_tshirt"),
      quantite: 3,
      prixTtcUnitaire: centimes(2_400),
      coutRevientUnitaire: centimes(334),
      coutRevientTotal: centimes(1_001),
      tauxTva: 0.2,
    });
    expect(soldeCompte(gl, "35")).toBe(-1_001);
    expect(Math.abs(soldeCompte(gl, "7135"))).toBe(1_001); // 7135 est un compte de produits : débité de 10,01 €
  });
});
