import { describe, expect, it } from "vitest";
import { centimes, moisJeu } from "../types/primitifs.js";
import {
  ajouterCompte,
  ComptabiliteError,
  enEquilibre,
  enregistrer,
  grandLivreVide,
  planComptableV1,
  resultat,
  soldeCompte,
  totalActif,
  totalCharges,
  totalPassif,
  totalProduits,
  type EcritureComptable,
  type GrandLivre,
} from "./index.js";

function ecriture(
  partiel: Omit<EcritureComptable, "mois"> & { mois?: number },
): EcritureComptable {
  return {
    ...partiel,
    mois: moisJeu(partiel.mois ?? 0),
  };
}

describe("grand livre vide", () => {
  it("un grand livre vide est en équilibre", () => {
    const gl = grandLivreVide();
    expect(totalActif(gl)).toBe(0);
    expect(totalPassif(gl)).toBe(0);
    expect(resultat(gl)).toBe(0);
    expect(enEquilibre(gl)).toBe(true);
  });

  it("le plan comptable V1 contient au moins les comptes essentiels", () => {
    const gl = planComptableV1();
    for (const numero of ["101", "164", "31", "35", "401", "411", "512", "707", "601", "641", "44566", "44571"]) {
      expect(gl.comptes[numero], `compte ${numero} absent`).toBeDefined();
    }
    expect(gl.comptes["512"]?.libelle).toBe("Banque");
  });

  it("refuse d'ajouter deux fois le même compte", () => {
    const gl = ajouterCompte(grandLivreVide(), {
      numero: "512",
      libelle: "Banque",
      type: "actif",
    });
    expect(() =>
      ajouterCompte(gl, {
        numero: "512",
        libelle: "Autre banque",
        type: "actif",
      }),
    ).toThrow(ComptabiliteError);
  });
});

describe("enregistrement d'une écriture", () => {
  it("refuse une écriture avec une seule ligne", () => {
    expect(() =>
      enregistrer(
        planComptableV1(),
        ecriture({
          id: "ec_1",
          libelle: "Ligne orpheline",
          lignes: [
            { compte: "512", sens: "debit", montant: centimes(100) },
          ],
        }),
      ),
    ).toThrow(/partie double/);
  });

  it("refuse une écriture déséquilibrée", () => {
    expect(() =>
      enregistrer(
        planComptableV1(),
        ecriture({
          id: "ec_1",
          libelle: "Mauvais équilibrage",
          lignes: [
            { compte: "512", sens: "debit", montant: centimes(100) },
            { compte: "101", sens: "credit", montant: centimes(50) },
          ],
        }),
      ),
    ).toThrow(/déséquilibrée/);
  });

  it("refuse un compte inconnu", () => {
    expect(() =>
      enregistrer(
        planComptableV1(),
        ecriture({
          id: "ec_1",
          libelle: "Compte inconnu",
          lignes: [
            { compte: "999", sens: "debit", montant: centimes(100) },
            { compte: "101", sens: "credit", montant: centimes(100) },
          ],
        }),
      ),
    ).toThrow(/inconnu/);
  });

  it("refuse un montant à zéro", () => {
    expect(() =>
      enregistrer(
        planComptableV1(),
        ecriture({
          id: "ec_1",
          libelle: "Montant nul",
          lignes: [
            { compte: "512", sens: "debit", montant: centimes(0) },
            { compte: "101", sens: "credit", montant: centimes(0) },
          ],
        }),
      ),
    ).toThrow(/positif/);
  });
});

describe("scénarios comptables (critère T04 : actif = passif + résultat)", () => {
  function verifierEquilibre(gl: GrandLivre, etape: string) {
    expect(enEquilibre(gl), `équilibre perdu à l'étape : ${etape}`).toBe(true);
  }

  it("apport de capital 20 000 € : actif = passif", () => {
    const gl = enregistrer(
      planComptableV1(),
      ecriture({
        id: "apport",
        libelle: "Apport de capital initial",
        lignes: [
          { compte: "512", sens: "debit", montant: centimes(2_000_000) },
          { compte: "101", sens: "credit", montant: centimes(2_000_000) },
        ],
      }),
    );

    expect(soldeCompte(gl, "512")).toBe(2_000_000);
    expect(soldeCompte(gl, "101")).toBe(2_000_000);
    expect(totalActif(gl)).toBe(2_000_000);
    expect(totalPassif(gl)).toBe(2_000_000);
    expect(resultat(gl)).toBe(0);
    verifierEquilibre(gl, "apport");
  });

  it("achat de tissu à crédit 500 € : stocks montent, dette fournisseur monte", () => {
    const gl1 = enregistrer(
      planComptableV1(),
      ecriture({
        id: "apport",
        libelle: "Apport",
        lignes: [
          { compte: "512", sens: "debit", montant: centimes(2_000_000) },
          { compte: "101", sens: "credit", montant: centimes(2_000_000) },
        ],
      }),
    );

    const gl2 = enregistrer(
      gl1,
      ecriture({
        id: "achat_tissu",
        libelle: "Commande de jersey à crédit",
        lignes: [
          { compte: "31", sens: "debit", montant: centimes(50_000) },
          { compte: "401", sens: "credit", montant: centimes(50_000) },
        ],
      }),
    );

    expect(soldeCompte(gl2, "31")).toBe(50_000);
    expect(soldeCompte(gl2, "401")).toBe(50_000);
    expect(totalActif(gl2)).toBe(2_050_000);
    expect(totalPassif(gl2)).toBe(2_050_000);
    verifierEquilibre(gl2, "achat tissu");
  });

  it("vente d'un t-shirt 36 € TTC : actif monte, résultat monte", () => {
    const gl = enregistrer(
      planComptableV1(),
      ecriture({
        id: "vente",
        libelle: "Vente d'un t-shirt",
        lignes: [
          { compte: "512", sens: "debit", montant: centimes(3600) },
          { compte: "707", sens: "credit", montant: centimes(3000) },
          { compte: "44571", sens: "credit", montant: centimes(600) },
        ],
      }),
    );

    expect(totalActif(gl)).toBe(3600);
    expect(totalPassif(gl)).toBe(600);
    expect(totalProduits(gl)).toBe(3000);
    expect(resultat(gl)).toBe(3000);
    verifierEquilibre(gl, "vente t-shirt");
  });

  it("scénario complet : apport + achat + salaire + vente, équilibre à chaque étape", () => {
    let gl = planComptableV1();

    gl = enregistrer(
      gl,
      ecriture({
        id: "apport",
        libelle: "Apport de capital",
        lignes: [
          { compte: "512", sens: "debit", montant: centimes(2_000_000) },
          { compte: "101", sens: "credit", montant: centimes(2_000_000) },
        ],
      }),
    );
    verifierEquilibre(gl, "apport");

    gl = enregistrer(
      gl,
      ecriture({
        id: "achat",
        libelle: "Achat tissu réglé en banque",
        lignes: [
          { compte: "601", sens: "debit", montant: centimes(80_000) },
          { compte: "512", sens: "credit", montant: centimes(80_000) },
        ],
      }),
    );
    verifierEquilibre(gl, "achat tissu");
    expect(totalCharges(gl)).toBe(80_000);
    expect(resultat(gl)).toBe(-80_000);

    gl = enregistrer(
      gl,
      ecriture({
        id: "salaire",
        libelle: "Salaire du mois",
        lignes: [
          { compte: "641", sens: "debit", montant: centimes(193_300) },
          { compte: "512", sens: "credit", montant: centimes(193_300) },
        ],
      }),
    );
    verifierEquilibre(gl, "salaire");

    gl = enregistrer(
      gl,
      ecriture({
        id: "vente",
        libelle: "Ventes du mois (100 t-shirts à 36 € TTC)",
        lignes: [
          { compte: "512", sens: "debit", montant: centimes(360_000) },
          { compte: "707", sens: "credit", montant: centimes(300_000) },
          { compte: "44571", sens: "credit", montant: centimes(60_000) },
        ],
      }),
    );
    verifierEquilibre(gl, "vente");

    expect(soldeCompte(gl, "512")).toBe(2_086_700);
    expect(soldeCompte(gl, "44571")).toBe(60_000);
    expect(totalProduits(gl)).toBe(300_000);
    expect(totalCharges(gl)).toBe(273_300);
    expect(resultat(gl)).toBe(26_700);
    expect(totalActif(gl)).toBe(totalPassif(gl) + resultat(gl));
  });
});

describe("soldeCompte", () => {
  it("échoue si le compte n'existe pas", () => {
    expect(() => soldeCompte(planComptableV1(), "999")).toThrow(/introuvable/);
  });

  it("rend zéro pour un compte jamais mouvementé", () => {
    expect(soldeCompte(planComptableV1(), "512")).toBe(0);
  });
});
