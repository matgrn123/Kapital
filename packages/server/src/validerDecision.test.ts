import {
  centimes,
  idEntreprise,
  idFaconnier,
  idFournisseur,
  idMatiere,
  idProduit,
  idSalarie,
  minutes,
  type CatalogueFournisseur,
  type Decision,
  type Entreprise,
  type Fournisseur,
  type Produit,
} from "@kapital/engine";
import { describe, expect, it } from "vitest";
import {
  validerDecision,
  validerDecisions,
} from "./validerDecision.js";
import type { ContexteValidation } from "./types.js";

const ENT = idEntreprise("ent_test");
const PROD = idProduit("prod_tshirt");
const MAT = idMatiere("mat_jersey");
const FOUR = idFournisseur("four_fr");
const FAC = idFaconnier("fac_pt");
const SAL = idSalarie("sal_1");

function entreprise(overrides: Partial<Entreprise> = {}): Entreprise {
  return {
    id: ENT,
    nom: "Test",
    gamme: "milieu",
    etape: 1,
    proprietaire: { type: "joueur", idProfil: "profil_test" },
    statut: "active",
    tresorerie: centimes(2_000_000),
    stocksMatiere: [
      { matiere: MAT, quantite: 100, valeurTotale: centimes(50_000) },
    ],
    stocksFinis: [],
    salaries: [
      {
        id: SAL,
        poste: "artisan",
        salaireBrutMensuel: centimes(186_702),
        ancienneteMois: 6,
        experienceMois: 6,
      },
    ],
    atelier: {
      surfaceM2: 50,
      loyerMensuel: centimes(100_000),
      nombreMachines: 2,
    },
    marque: { notoriete: 40, desirabilite: 40 },
    prets: [],
    catalogue: [
      {
        produit: PROD,
        qualiteVisee: 60,
        prix: { vente_directe: centimes(6000), revendeur: centimes(3000) },
        productionMensuelleCible: 100,
      },
    ],
    ...overrides,
  };
}

function produit(): Produit {
  return {
    id: PROD,
    type: "t_shirt",
    nom: "T-shirt basique",
    matiere: MAT,
    consommationParPiece: 0.8,
    fournituresParPiece: centimes(60),
    tempsStandard: minutes(25),
  };
}

function fournisseur(): Fournisseur {
  return {
    id: FOUR,
    nom: "Fournisseur FR",
    qualite: 80,
    delaiMois: 1,
    fiabilite: 0.95,
    minimumCommande: 50,
    delaiPaiementMois: 1,
  };
}

function catalogue(): CatalogueFournisseur {
  return {
    fournisseur: FOUR,
    lignes: [{ matiere: MAT, prix: centimes(500) }],
  };
}

function ctxDefault(ent?: Entreprise): ContexteValidation {
  return {
    entreprise: ent ?? entreprise(),
    fournisseurs: [fournisseur()],
    catalogues: [catalogue()],
    produits: [produit()],
  };
}

describe("garde-fou global", () => {
  it("refuse toute décision si l'entreprise est liquidée", () => {
    const ctx = ctxDefault(entreprise({ statut: "liquidee" }));
    const d: Decision = {
      type: "action_marketing",
      action: "publicite",
      montant: centimes(10_000),
    };
    const r = validerDecision(ctx, d);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("entreprise_liquidee");
      expect(r.message).toMatch(/liquidée/);
    }
  });
});

describe("changer_prix", () => {
  it("accepte un prix positif d'un produit du catalogue", () => {
    const r = validerDecision(ctxDefault(), {
      type: "changer_prix",
      produit: PROD,
      canal: "vente_directe",
      prix: centimes(5500),
    });
    expect(r.ok).toBe(true);
  });

  it("refuse un prix nul ou négatif", () => {
    const r = validerDecision(ctxDefault(), {
      type: "changer_prix",
      produit: PROD,
      canal: "vente_directe",
      prix: centimes(0),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("prix_negatif_ou_nul");
  });

  it("refuse un produit absent du catalogue de l'entreprise", () => {
    const r = validerDecision(ctxDefault(), {
      type: "changer_prix",
      produit: idProduit("prod_inconnu"),
      canal: "vente_directe",
      prix: centimes(3000),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("produit_pas_au_catalogue");
  });
});

describe("commander_matiere", () => {
  it("accepte une commande au-dessus du minimum pour une matière du catalogue", () => {
    const r = validerDecision(ctxDefault(), {
      type: "commander_matiere",
      matiere: MAT,
      quantite: 100,
      fournisseur: FOUR,
    });
    expect(r.ok).toBe(true);
  });

  it("refuse une quantité sous le minimum du fournisseur", () => {
    const r = validerDecision(ctxDefault(), {
      type: "commander_matiere",
      matiere: MAT,
      quantite: 20,
      fournisseur: FOUR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("sous_minimum_commande");
      expect(r.message).toMatch(/minimum/);
    }
  });

  it("refuse une quantité nulle ou négative", () => {
    const r = validerDecision(ctxDefault(), {
      type: "commander_matiere",
      matiere: MAT,
      quantite: 0,
      fournisseur: FOUR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("quantite_invalide");
  });

  it("refuse un fournisseur inconnu", () => {
    const r = validerDecision(ctxDefault(), {
      type: "commander_matiere",
      matiere: MAT,
      quantite: 100,
      fournisseur: idFournisseur("inconnu"),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("fournisseur_inconnu");
  });

  it("refuse une matière hors catalogue", () => {
    const r = validerDecision(ctxDefault(), {
      type: "commander_matiere",
      matiere: idMatiere("mat_popeline"),
      quantite: 100,
      fournisseur: FOUR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("matiere_pas_au_catalogue");
  });
});

describe("ordre_production", () => {
  it("accepte une production avec stock suffisant et atelier", () => {
    const r = validerDecision(ctxDefault(), {
      type: "ordre_production",
      produit: PROD,
      quantite: 50,
      lieu: { type: "atelier" },
    });
    expect(r.ok).toBe(true);
  });

  it("refuse si stock matière insuffisant (besoin 0,8 × 200 = 160 m, stock 100)", () => {
    const r = validerDecision(ctxDefault(), {
      type: "ordre_production",
      produit: PROD,
      quantite: 200,
      lieu: { type: "atelier" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("stock_matiere_insuffisant");
      expect(r.message).toMatch(/Matière/);
    }
  });

  it("refuse une production en atelier si l'entreprise n'en a pas", () => {
    const ctx = ctxDefault(entreprise({ atelier: null }));
    const r = validerDecision(ctx, {
      type: "ordre_production",
      produit: PROD,
      quantite: 50,
      lieu: { type: "atelier" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("sans_atelier");
  });

  it("accepte une production chez un façonnier même sans atelier", () => {
    const ctx = ctxDefault(entreprise({ atelier: null }));
    const r = validerDecision(ctx, {
      type: "ordre_production",
      produit: PROD,
      quantite: 50,
      lieu: { type: "faconnier", faconnier: FAC },
    });
    expect(r.ok).toBe(true);
  });

  it("refuse un produit inconnu", () => {
    const r = validerDecision(ctxDefault(), {
      type: "ordre_production",
      produit: idProduit("inconnu"),
      quantite: 10,
      lieu: { type: "atelier" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("produit_inconnu");
  });
});

describe("action_marketing", () => {
  it("accepte une action avec fonds suffisants", () => {
    const r = validerDecision(ctxDefault(), {
      type: "action_marketing",
      action: "publicite",
      montant: centimes(100_000),
    });
    expect(r.ok).toBe(true);
  });

  it("refuse une action avec montant > trésorerie", () => {
    const r = validerDecision(ctxDefault(), {
      type: "action_marketing",
      action: "publicite",
      montant: centimes(5_000_000),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("tresorerie_insuffisante");
      expect(r.message).toMatch(/il manque/);
    }
  });

  it("refuse un montant nul", () => {
    const r = validerDecision(ctxDefault(), {
      type: "action_marketing",
      action: "publicite",
      montant: centimes(0),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("montant_invalide");
  });
});

describe("embauche", () => {
  it("accepte une embauche artisan avec fonds suffisants", () => {
    const r = validerDecision(ctxDefault(), {
      type: "embauche",
      poste: "artisan",
      salaireBrutMensuel: centimes(186_702),
    });
    expect(r.ok).toBe(true);
  });

  it("refuse une embauche encadrement si étape < 1", () => {
    const ctx = ctxDefault(entreprise({ etape: 0 }));
    const r = validerDecision(ctx, {
      type: "embauche",
      poste: "encadrement",
      salaireBrutMensuel: centimes(300_000),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("etape_insuffisante");
  });

  it("refuse une embauche sans deux mois de salaire en réserve", () => {
    const ctx = ctxDefault(entreprise({ tresorerie: centimes(100_000) }));
    const r = validerDecision(ctx, {
      type: "embauche",
      poste: "artisan",
      salaireBrutMensuel: centimes(200_000),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("tresorerie_insuffisante");
  });
});

describe("licenciement", () => {
  it("accepte le licenciement d'un salarié existant", () => {
    const r = validerDecision(ctxDefault(), {
      type: "licenciement",
      salarie: SAL,
    });
    expect(r.ok).toBe(true);
  });

  it("refuse si le salarié n'existe pas", () => {
    const r = validerDecision(ctxDefault(), {
      type: "licenciement",
      salarie: idSalarie("fantome"),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("salarie_inconnu");
  });
});

describe("demande_pret", () => {
  it("accepte un prêt raisonnable", () => {
    const r = validerDecision(ctxDefault(), {
      type: "demande_pret",
      montant: centimes(1_000_000),
      dureeMois: 60,
    });
    expect(r.ok).toBe(true);
  });

  it("refuse un montant nul ou négatif", () => {
    const r = validerDecision(ctxDefault(), {
      type: "demande_pret",
      montant: centimes(0),
      dureeMois: 60,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("montant_invalide");
  });

  it("refuse une durée hors bornes", () => {
    const r = validerDecision(ctxDefault(), {
      type: "demande_pret",
      montant: centimes(500_000),
      dureeMois: 6,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("duree_hors_bornes");
  });

  it("refuse un endettement supérieur à 5× la trésorerie", () => {
    const ctx = ctxDefault(entreprise({ tresorerie: centimes(500_000) }));
    const r = validerDecision(ctx, {
      type: "demande_pret",
      montant: centimes(10_000_000),
      dureeMois: 60,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("endettement_excessif");
      expect(r.message).toMatch(/dette/i);
    }
  });
});

describe("validerDecisions (en lot)", () => {
  it("rend une liste de résultats, un par décision", () => {
    const decisions: Decision[] = [
      { type: "action_marketing", action: "publicite", montant: centimes(10_000) },
      { type: "action_marketing", action: "publicite", montant: centimes(0) },
      { type: "licenciement", salarie: SAL },
    ];
    const r = validerDecisions(ctxDefault(), decisions);
    expect(r).toHaveLength(3);
    expect(r[0]!.ok).toBe(true);
    expect(r[1]!.ok).toBe(false);
    expect(r[2]!.ok).toBe(true);
  });
});
