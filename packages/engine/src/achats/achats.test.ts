import { describe, expect, it } from "vitest";
import {
  enEquilibre,
  planComptableV1,
  soldeCompte,
  totalActif,
  totalPassif,
} from "../comptabilite/index.js";
import {
  centimes,
  idEntreprise,
  idFournisseur,
  idMatiere,
  moisJeu,
} from "../types/primitifs.js";
import {
  commandesAArriver,
  ErreurCommande,
  livrer,
  passerCommande,
  prixChezFournisseur,
  type CatalogueFournisseur,
  type Fournisseur,
} from "./index.js";

const ENT = idEntreprise("ent_test");
const FOUR_FR = idFournisseur("four_fr");
const FOUR_PT = idFournisseur("four_pt");
const JERSEY = idMatiere("mat_jersey_coton");
const POPELINE = idMatiere("mat_popeline");

function fournisseurFr(): Fournisseur {
  return {
    id: FOUR_FR,
    nom: "Fournisseur France",
    qualite: 80,
    delaiMois: 1,
    fiabilite: 0.95,
    minimumCommande: 50,
    delaiPaiementMois: 1,
  };
}

function fournisseurPt(): Fournisseur {
  return {
    id: FOUR_PT,
    nom: "Fournisseur Portugal",
    qualite: 75,
    delaiMois: 2,
    fiabilite: 0.9,
    minimumCommande: 75,
    delaiPaiementMois: 1,
  };
}

function catalogueFr(prixJersey = 500): CatalogueFournisseur {
  return {
    fournisseur: FOUR_FR,
    lignes: [
      { matiere: JERSEY, prix: centimes(prixJersey) },
      { matiere: POPELINE, prix: centimes(900) },
    ],
  };
}

function cataloguePt(prixJersey = 400): CatalogueFournisseur {
  return {
    fournisseur: FOUR_PT,
    lignes: [{ matiere: JERSEY, prix: centimes(prixJersey) }],
  };
}

describe("prixChezFournisseur", () => {
  it("rend le prix si la matière est au catalogue", () => {
    expect(prixChezFournisseur(catalogueFr(), JERSEY)).toBe(500);
  });

  it("rend undefined si la matière n'est pas au catalogue", () => {
    expect(prixChezFournisseur(cataloguePt(), POPELINE)).toBeUndefined();
  });
});

describe("passerCommande — critère T05 : bon mois, bon prix", () => {
  it("critère officiel : commande au mois 0 chez fournisseur délai 2 arrive au mois 2", () => {
    const c = passerCommande({
      id: "cmd_1",
      entreprise: ENT,
      fournisseur: fournisseurPt(),
      catalogue: cataloguePt(),
      matiere: JERSEY,
      quantite: 100,
      moisCommande: moisJeu(0),
    });
    expect(c.moisLivraisonPrevu).toBe(2);
  });

  it("critère officiel : le prix est figé à la commande, pas à la livraison", () => {
    const c = passerCommande({
      id: "cmd_prix",
      entreprise: ENT,
      fournisseur: fournisseurFr(),
      catalogue: catalogueFr(500),
      matiere: JERSEY,
      quantite: 100,
      moisCommande: moisJeu(0),
    });
    expect(c.prixUnitaire).toBe(500);

    const catalogueApres = catalogueFr(700);
    expect(prixChezFournisseur(catalogueApres, JERSEY)).toBe(700);
    expect(c.prixUnitaire).toBe(500);
  });

  it("refuse une quantité sous le minimum de commande", () => {
    expect(() =>
      passerCommande({
        id: "cmd_mini",
        entreprise: ENT,
        fournisseur: fournisseurFr(),
        catalogue: catalogueFr(),
        matiere: JERSEY,
        quantite: 20,
        moisCommande: moisJeu(0),
      }),
    ).toThrow(ErreurCommande);
  });

  it("refuse une quantité nulle ou négative", () => {
    expect(() =>
      passerCommande({
        id: "cmd_zero",
        entreprise: ENT,
        fournisseur: fournisseurFr(),
        catalogue: catalogueFr(),
        matiere: JERSEY,
        quantite: 0,
        moisCommande: moisJeu(0),
      }),
    ).toThrow(/positive/);
  });

  it("refuse une matière inconnue au catalogue", () => {
    expect(() =>
      passerCommande({
        id: "cmd_inconnu",
        entreprise: ENT,
        fournisseur: fournisseurPt(),
        catalogue: cataloguePt(),
        matiere: POPELINE,
        quantite: 100,
        moisCommande: moisJeu(0),
      }),
    ).toThrow(/ne vend pas/);
  });

  it("refuse un catalogue qui ne correspond pas au fournisseur", () => {
    expect(() =>
      passerCommande({
        id: "cmd_mix",
        entreprise: ENT,
        fournisseur: fournisseurFr(),
        catalogue: cataloguePt(),
        matiere: JERSEY,
        quantite: 100,
        moisCommande: moisJeu(0),
      }),
    ).toThrow(/inconsistant/);
  });

  it("crée la commande au statut en_cours", () => {
    const c = passerCommande({
      id: "cmd_ok",
      entreprise: ENT,
      fournisseur: fournisseurFr(),
      catalogue: catalogueFr(),
      matiere: JERSEY,
      quantite: 100,
      moisCommande: moisJeu(3),
    });
    expect(c.statut).toBe("en_cours");
    expect(c.moisCommande).toBe(3);
    expect(c.moisLivraisonPrevu).toBe(4);
  });
});

describe("commandesAArriver", () => {
  it("ne retourne que les commandes dont la livraison est le mois courant", () => {
    const c1 = passerCommande({
      id: "a",
      entreprise: ENT,
      fournisseur: fournisseurFr(),
      catalogue: catalogueFr(),
      matiere: JERSEY,
      quantite: 100,
      moisCommande: moisJeu(0),
    });
    const c2 = passerCommande({
      id: "b",
      entreprise: ENT,
      fournisseur: fournisseurPt(),
      catalogue: cataloguePt(),
      matiere: JERSEY,
      quantite: 100,
      moisCommande: moisJeu(0),
    });
    const toutes = [c1, c2];

    expect(commandesAArriver(toutes, moisJeu(1)).map((c) => c.id)).toEqual([
      "a",
    ]);
    expect(commandesAArriver(toutes, moisJeu(2)).map((c) => c.id)).toEqual([
      "b",
    ]);
    expect(commandesAArriver(toutes, moisJeu(3))).toHaveLength(0);
  });

  it("ignore les commandes déjà livrées", () => {
    const c = passerCommande({
      id: "a",
      entreprise: ENT,
      fournisseur: fournisseurFr(),
      catalogue: catalogueFr(),
      matiere: JERSEY,
      quantite: 100,
      moisCommande: moisJeu(0),
    });
    const livree = { ...c, statut: "livree" as const };
    expect(commandesAArriver([livree], moisJeu(1))).toHaveLength(0);
  });
});

describe("livrer — écriture comptable", () => {
  it("crée l'écriture 31 (débit) / 401 (crédit) et marque livrée", () => {
    const c = passerCommande({
      id: "l_1",
      entreprise: ENT,
      fournisseur: fournisseurFr(),
      catalogue: catalogueFr(500),
      matiere: JERSEY,
      quantite: 100,
      moisCommande: moisJeu(0),
    });

    const { grandLivre, commande } = livrer(planComptableV1(), c);

    expect(commande.statut).toBe("livree");
    expect(soldeCompte(grandLivre, "31")).toBe(50_000);
    expect(soldeCompte(grandLivre, "401")).toBe(50_000);
    expect(totalActif(grandLivre)).toBe(50_000);
    expect(totalPassif(grandLivre)).toBe(50_000);
    expect(enEquilibre(grandLivre)).toBe(true);
  });

  it("refuse de livrer deux fois la même commande", () => {
    const c = passerCommande({
      id: "l_double",
      entreprise: ENT,
      fournisseur: fournisseurFr(),
      catalogue: catalogueFr(),
      matiere: JERSEY,
      quantite: 100,
      moisCommande: moisJeu(0),
    });
    const { grandLivre, commande } = livrer(planComptableV1(), c);
    expect(() => livrer(grandLivre, commande)).toThrow(/déjà livrée/);
  });
});

describe("scénario deux fournisseurs : France et Portugal", () => {
  it("chacun arrive à son mois, à son prix figé", () => {
    const cFr = passerCommande({
      id: "fr",
      entreprise: ENT,
      fournisseur: fournisseurFr(),
      catalogue: catalogueFr(500),
      matiere: JERSEY,
      quantite: 100,
      moisCommande: moisJeu(0),
    });
    const cPt = passerCommande({
      id: "pt",
      entreprise: ENT,
      fournisseur: fournisseurPt(),
      catalogue: cataloguePt(400),
      matiere: JERSEY,
      quantite: 100,
      moisCommande: moisJeu(0),
    });

    expect(cFr.moisLivraisonPrevu).toBe(1);
    expect(cFr.prixUnitaire).toBe(500);
    expect(cPt.moisLivraisonPrevu).toBe(2);
    expect(cPt.prixUnitaire).toBe(400);

    let gl = planComptableV1();
    const r1 = livrer(gl, cFr);
    gl = r1.grandLivre;
    expect(soldeCompte(gl, "31")).toBe(50_000);
    expect(enEquilibre(gl)).toBe(true);

    const r2 = livrer(gl, cPt);
    gl = r2.grandLivre;
    expect(soldeCompte(gl, "31")).toBe(90_000);
    expect(soldeCompte(gl, "401")).toBe(90_000);
    expect(enEquilibre(gl)).toBe(true);
  });
});
