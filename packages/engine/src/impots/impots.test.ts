import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import {
  enEquilibre,
  planComptableV1,
  resultat,
  soldeCompte,
  type GrandLivre,
} from "../comptabilite/index.js";
import { centimes, moisJeu } from "../types/primitifs.js";
import {
  calculDeclarationTva,
  calculImpotSocietes,
  enregistrerDeclarationTva,
  enregistrerImpotSocietes,
  parametresIsDepuis,
} from "./calculs.js";

function glAvecTva(collectee: number, deductible: number): GrandLivre {
  const gl = planComptableV1();
  return {
    ...gl,
    ecritures: [
      {
        id: "e1",
        mois: moisJeu(0),
        libelle: "Vente",
        lignes: [
          { compte: "512", sens: "debit", montant: centimes(10 * collectee) },
          {
            compte: "707",
            sens: "credit",
            montant: centimes(10 * collectee - collectee),
          },
          { compte: "44571", sens: "credit", montant: centimes(collectee) },
          {
            compte: "7135",
            sens: "debit",
            montant: centimes(collectee / 2),
          },
          {
            compte: "35",
            sens: "credit",
            montant: centimes(collectee / 2),
          },
        ],
      },
      {
        id: "e2",
        mois: moisJeu(0),
        libelle: "Achat déductible",
        lignes: [
          { compte: "601", sens: "debit", montant: centimes(10 * deductible) },
          { compte: "44566", sens: "debit", montant: centimes(deductible) },
          {
            compte: "512",
            sens: "credit",
            montant: centimes(10 * deductible + deductible),
          },
        ],
      },
    ],
  };
}

describe("calculDeclarationTva", () => {
  it("rend le net à verser = collectée - déductible", () => {
    const gl = glAvecTva(10000, 3000);
    const d = calculDeclarationTva(gl);
    expect(d.tvaCollectee).toBe(10000);
    expect(d.tvaDeductible).toBe(3000);
    expect(d.soldeNet).toBe(7000);
  });

  it("rend un net négatif si déductible > collectée", () => {
    const gl = glAvecTva(3000, 10000);
    const d = calculDeclarationTva(gl);
    expect(d.soldeNet).toBe(-7000);
  });
});

describe("enregistrerDeclarationTva — critère T12 : TVA passe en compta", () => {
  it("apure 44571 et 44566, crédit 512 du net à verser, équilibre", () => {
    let gl = glAvecTva(10000, 3000);
    gl = enregistrerDeclarationTva(gl, {
      idEcriture: "tva_t1",
      mois: moisJeu(3),
    });
    expect(soldeCompte(gl, "44571")).toBe(0);
    expect(soldeCompte(gl, "44566")).toBe(0);
    expect(enEquilibre(gl)).toBe(true);
  });

  it("si crédit de TVA : pas d'écriture, les soldes restent pour report", () => {
    let gl = glAvecTva(3000, 10000);
    const avant = soldeCompte(gl, "44566");
    gl = enregistrerDeclarationTva(gl, {
      idEcriture: "tva_t2",
      mois: moisJeu(3),
    });
    expect(soldeCompte(gl, "44566")).toBe(avant);
  });
});

describe("calculImpotSocietes", () => {
  function p() {
    return parametresIsDepuis(chargerParametresV1());
  }

  it("perte : IS = 0", () => {
    expect(calculImpotSocietes(centimes(-500_000), p())).toBe(0);
  });

  it("bénéfice sous plafond réduit : 15 %", () => {
    const is = calculImpotSocietes(centimes(1_000_000), p());
    expect(is).toBe(150_000);
  });

  it("bénéfice juste au plafond : 15 % × 42 500 €", () => {
    const is = calculImpotSocietes(centimes(4_250_000), p());
    expect(is).toBe(637_500);
  });

  it("bénéfice au-dessus du plafond : taux plein sur la partie supérieure", () => {
    const beneficeTotal = 5_000_000;
    const is = calculImpotSocietes(centimes(beneficeTotal), p());
    const attendu = Math.round(4_250_000 * 0.15 + (5_000_000 - 4_250_000) * 0.25);
    expect(is).toBe(attendu);
  });
});

describe("enregistrerImpotSocietes — critère T12 : IS passe en compta", () => {
  it("ne fait rien si montant à 0", () => {
    const gl = enregistrerImpotSocietes(planComptableV1(), {
      idEcriture: "is",
      mois: moisJeu(11),
      montant: centimes(0),
    });
    expect(gl.ecritures).toHaveLength(0);
  });

  it("passe 695 débit / 444 crédit, équilibre maintenu", () => {
    const gl = enregistrerImpotSocietes(planComptableV1(), {
      idEcriture: "is_2026",
      mois: moisJeu(11),
      montant: centimes(150_000),
    });
    expect(soldeCompte(gl, "695")).toBe(150_000);
    expect(soldeCompte(gl, "444")).toBe(150_000);
    expect(enEquilibre(gl)).toBe(true);
  });

  it("l'IS réduit le résultat net final", () => {
    let gl = glAvecTva(10000, 3000);
    const resultatAvant = resultat(gl);
    const is = calculImpotSocietes(centimes(resultatAvant), parametresIsDepuis(chargerParametresV1()));
    gl = enregistrerImpotSocietes(gl, {
      idEcriture: "is",
      mois: moisJeu(11),
      montant: is,
    });
    expect(resultat(gl)).toBe(resultatAvant - is);
    expect(enEquilibre(gl)).toBe(true);
  });
});
