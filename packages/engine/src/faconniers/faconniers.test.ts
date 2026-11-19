import { describe, expect, it } from "vitest";
import {
  enEquilibre,
  planComptableV1,
  soldeCompte,
} from "../comptabilite/index.js";
import {
  centimes,
  idEntreprise,
  idFaconnier,
  idProduit,
  moisJeu,
} from "../types/primitifs.js";
import {
  coutRevientFaconnier,
  ErreurFaconnier,
  livrerFaconnier,
  passerOrdreFaconnier,
  prixChezFaconnier,
  type Faconnier,
} from "./index.js";

const ENT = idEntreprise("ent_test");
const FAC_PT = idFaconnier("fac_portugal");
const FAC_TR = idFaconnier("fac_turquie");
const TSHIRT = idProduit("prod_tshirt");
const CHEMISE = idProduit("prod_chemise");

function faconnierPt(prixFaconTshirt = 450): Faconnier {
  return {
    id: FAC_PT,
    nom: "Façonnier Portugal",
    pays: "Portugal",
    delaiMois: 2,
    fiabilite: 0.9,
    minimumCommande: 75,
    delaiPaiementMois: 1,
    prix: [{ produit: TSHIRT, prixParPiece: centimes(prixFaconTshirt) }],
  };
}

function faconnierTurquie(): Faconnier {
  return {
    id: FAC_TR,
    nom: "Façonnier Turquie",
    pays: "Turquie",
    delaiMois: 2,
    fiabilite: 0.85,
    minimumCommande: 300,
    delaiPaiementMois: 2,
    prix: [{ produit: TSHIRT, prixParPiece: centimes(300) }],
  };
}

describe("prixChezFaconnier", () => {
  it("rend le prix pour un produit au catalogue", () => {
    expect(prixChezFaconnier(faconnierPt(), TSHIRT)).toBe(450);
  });
  it("rend undefined pour un produit inconnu", () => {
    expect(prixChezFaconnier(faconnierPt(), CHEMISE)).toBeUndefined();
  });
});

describe("passerOrdreFaconnier", () => {
  it("fige le prix façon et calcule le mois de livraison", () => {
    const o = passerOrdreFaconnier({
      id: "o_1",
      entreprise: ENT,
      faconnier: faconnierPt(450),
      produit: TSHIRT,
      quantite: 100,
      moisCommande: moisJeu(0),
    });
    expect(o.prixFaconParPiece).toBe(450);
    expect(o.moisLivraisonPrevu).toBe(2);
    expect(o.statut).toBe("en_cours");
  });

  it("refuse sous le minimum (Turquie 300 pièces)", () => {
    expect(() =>
      passerOrdreFaconnier({
        id: "o_mini",
        entreprise: ENT,
        faconnier: faconnierTurquie(),
        produit: TSHIRT,
        quantite: 100,
        moisCommande: moisJeu(0),
      }),
    ).toThrow(ErreurFaconnier);
  });

  it("refuse une quantité négative ou nulle", () => {
    expect(() =>
      passerOrdreFaconnier({
        id: "o_neg",
        entreprise: ENT,
        faconnier: faconnierPt(),
        produit: TSHIRT,
        quantite: 0,
        moisCommande: moisJeu(0),
      }),
    ).toThrow(/positive/);
  });

  it("refuse un produit non fabriqué par le façonnier", () => {
    expect(() =>
      passerOrdreFaconnier({
        id: "o_pro",
        entreprise: ENT,
        faconnier: faconnierPt(),
        produit: CHEMISE,
        quantite: 100,
        moisCommande: moisJeu(0),
      }),
    ).toThrow(/ne fabrique pas/);
  });
});

describe("coutRevientFaconnier — critère T07 : t-shirt Portugal 8–11 €", () => {
  it("prix façon 450 centimes → coût de revient ≈ 970 centimes (9,70 €)", () => {
    const cr = coutRevientFaconnier({
      prixMatiereParUnite: centimes(500),
      consommationParPiece: 0.8,
      tauxChute: 0.15,
      fournitures: centimes(60),
      prixFaconParPiece: centimes(450),
    });
    expect(cr).toBe(460 + 60 + 450);
  });

  it("critère officiel : coût revient t-shirt Portugal entre 8 et 11 €", () => {
    for (const prixFacon of [250, 350, 450, 550]) {
      const cr = coutRevientFaconnier({
        prixMatiereParUnite: centimes(500),
        consommationParPiece: 0.8,
        tauxChute: 0.15,
        fournitures: centimes(60),
        prixFaconParPiece: centimes(prixFacon),
      });
      expect(cr).toBeGreaterThanOrEqual(770);
      expect(cr).toBeLessThanOrEqual(1070);
    }
  });

  it("t-shirt Portugal nettement moins cher qu'en atelier France", () => {
    const portugal = coutRevientFaconnier({
      prixMatiereParUnite: centimes(500),
      consommationParPiece: 0.8,
      tauxChute: 0.15,
      fournitures: centimes(60),
      prixFaconParPiece: centimes(450),
    });
    const france = 460 + 60 + 25 * 60;
    expect(portugal).toBeLessThan(france);
  });
});

describe("livrerFaconnier — écriture comptable", () => {
  it("passe débit 35 = crédit 31 + crédit 401 et maintient l'équilibre", () => {
    let gl = planComptableV1();
    const o = passerOrdreFaconnier({
      id: "l_1",
      entreprise: ENT,
      faconnier: faconnierPt(450),
      produit: TSHIRT,
      quantite: 100,
      moisCommande: moisJeu(0),
    });
    const result = livrerFaconnier({
      grandLivre: gl,
      ordre: o,
      coutMatiereParPiece: centimes(460),
    });
    gl = result.grandLivre;

    expect(result.ordre.statut).toBe("livree");
    expect(soldeCompte(gl, "35")).toBe(91_000);
    expect(soldeCompte(gl, "31")).toBe(-46_000);
    expect(soldeCompte(gl, "401")).toBe(45_000);
    expect(enEquilibre(gl)).toBe(true);
  });

  it("scénario cohérent : stock matière existe déjà, puis livraison du façonnier", () => {
    let gl = planComptableV1();
    const apportBanque = 2_000_000;
    const stockMatiereInitial = 100_000;
    gl = {
      ...gl,
      ecritures: [
        {
          id: "init",
          mois: moisJeu(0),
          libelle: "Apport et achat matière initial",
          lignes: [
            {
              compte: "512",
              sens: "debit",
              montant: centimes(apportBanque - stockMatiereInitial),
            },
            {
              compte: "31",
              sens: "debit",
              montant: centimes(stockMatiereInitial),
            },
            { compte: "101", sens: "credit", montant: centimes(apportBanque) },
          ],
        },
      ],
    };
    expect(enEquilibre(gl)).toBe(true);

    const o = passerOrdreFaconnier({
      id: "l_2",
      entreprise: ENT,
      faconnier: faconnierPt(450),
      produit: TSHIRT,
      quantite: 100,
      moisCommande: moisJeu(0),
    });
    const result = livrerFaconnier({
      grandLivre: gl,
      ordre: o,
      coutMatiereParPiece: centimes(460),
    });
    gl = result.grandLivre;
    expect(enEquilibre(gl)).toBe(true);
    expect(soldeCompte(gl, "31")).toBe(100_000 - 46_000);
  });

  it("refuse de livrer deux fois le même ordre", () => {
    const o = passerOrdreFaconnier({
      id: "l_double",
      entreprise: ENT,
      faconnier: faconnierPt(450),
      produit: TSHIRT,
      quantite: 100,
      moisCommande: moisJeu(0),
    });
    const r1 = livrerFaconnier({
      grandLivre: planComptableV1(),
      ordre: o,
      coutMatiereParPiece: centimes(460),
    });
    expect(() =>
      livrerFaconnier({
        grandLivre: r1.grandLivre,
        ordre: r1.ordre,
        coutMatiereParPiece: centimes(460),
      }),
    ).toThrow(/déjà livré/);
  });
});
