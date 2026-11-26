import { describe, expect, it } from "vitest";
import {
  joursDeStock,
  libelleJours,
  libelleRythme,
  libelleVenduDepuis,
  lignesStock,
  mouvementsDeVente,
  produitsEnStockBas,
  rythmeDeVente,
  type EntreeStock,
} from "./stock";

// Horloge réelle : un pas par minute, un jour = 1 440 pas, un mois de 30 jours = 43 200 pas.
// Les tests de mouvementsDeVente gardent un petit mois fictif de 1 440 pas.
const PAS_PAR_MOIS = 1440;
const JOUR = 1440;
const MOIS = 30 * JOUR;
const TEMPS = { pasParMois: MOIS, pasParJour: JOUR, joursParMois: 30 };

function vente(mois: number, index: number, libelle: string, compte = "707") {
  return { ecriture_id: `vente_${mois}_societe_x_p${index}`, mois_jeu: mois, libelle, compte };
}

describe("mouvementsDeVente", () => {
  it("lit les pièces et le produit dans le libellé, une fois par écriture, et le pas dans l'identifiant", () => {
    const m = mouvementsDeVente(
      [
        vente(2, 10, "Vente directe 5 prod_tshirt"),
        // Deuxième ligne de la même écriture (44571) : ne compte pas deux fois.
        { ...vente(2, 10, "Vente directe 5 prod_tshirt"), compte: "44571" },
        vente(2, 11, "Vente revendeur 3 prod_tshirt"),
        vente(3, 0, "Vente boutique 2 prod_chemise"),
        { ecriture_id: "retour_3_societe_x_p4", mois_jeu: 3, libelle: "Retour 1 prod_tshirt", compte: "707" },
        { ecriture_id: "loyer_3", mois_jeu: 3, libelle: "Loyer atelier", compte: "613" },
      ],
      (mois) => mois * PAS_PAR_MOIS,
    );
    expect(m).toEqual([
      { produit: "prod_tshirt", pas: 2 * PAS_PAR_MOIS + 10, pieces: 5 },
      { produit: "prod_tshirt", pas: 2 * PAS_PAR_MOIS + 11, pieces: 3 },
      { produit: "prod_chemise", pas: 3 * PAS_PAR_MOIS, pieces: 2 },
      { produit: "prod_tshirt", pas: 3 * PAS_PAR_MOIS + 4, pieces: -1 },
    ]);
  });

  it("place au début du mois une écriture sans numéro de pas", () => {
    const m = mouvementsDeVente([{ ecriture_id: "vente_1_x", mois_jeu: 1, libelle: "Vente directe 4 prod_sac_toile" }], (mois) => mois * PAS_PAR_MOIS);
    expect(m).toEqual([{ produit: "prod_sac_toile", pas: PAS_PAR_MOIS, pieces: 4 }]);
  });
});

describe("rythmeDeVente", () => {
  const COURANT = 100 * JOUR;
  const mouvements = [
    { produit: "p", pas: COURANT - MOIS - 10, pieces: 50 }, // hors fenêtre (plus d'un mois avant)
    { produit: "p", pas: COURANT - 20 * JOUR, pieces: 30 },
    { produit: "p", pas: COURANT - 5 * JOUR, pieces: 32 },
    { produit: "p", pas: COURANT - JOUR, pieces: -2 }, // retour
    { produit: "autre", pas: COURANT - 5 * JOUR, pieces: 99 },
  ];
  const base = { pasCourant: COURANT, pasParMois: MOIS, pasParJour: JOUR, pasDebutVente: null };

  it("compte les ventes nettes du dernier mois et les ramène à un jour", () => {
    const r = rythmeDeVente(mouvements, "p", base);
    expect(r.piecesFenetre).toBe(60);
    expect(r.pasObserves).toBe(MOIS);
    expect(r.moinsDUnJour).toBe(false);
    expect(r.piecesParJour).toBe(2);
  });

  it("ne compte que le temps écoulé depuis l'arrivée du produit au catalogue", () => {
    const r = rythmeDeVente(mouvements, "p", { ...base, pasDebutVente: COURANT - 20 * JOUR });
    expect(r.pasObserves).toBe(20 * JOUR);
    expect(r.piecesParJour).toBe(3);
  });

  it("100 pièces vendues en une minute font 100 pièces par jour, pas 144 000 : on observe au moins un jour", () => {
    const r = rythmeDeVente([{ produit: "p", pas: COURANT - 1, pieces: 100 }], "p", { ...base, pasDebutVente: COURANT - 1 });
    expect(r.pasObserves).toBe(1);
    expect(r.moinsDUnJour).toBe(true);
    expect(r.piecesParJour).toBe(100);
  });

  it("au-delà d'un jour, divise par la durée réellement observée", () => {
    const r = rythmeDeVente([{ produit: "p", pas: COURANT - 10, pieces: 90 }], "p", { ...base, pasDebutVente: COURANT - 3 * JOUR });
    expect(r.moinsDUnJour).toBe(false);
    expect(r.piecesParJour).toBe(30);
  });

  it("vaut 0 sans vente, et jamais moins de 0 si les retours dépassent les ventes", () => {
    expect(rythmeDeVente([], "p", base).piecesParJour).toBe(0);
    const r = rythmeDeVente([{ produit: "p", pas: COURANT - 10, pieces: -3 }], "p", base);
    expect(r.piecesParJour).toBe(0);
  });

  it("ne divise jamais par zéro, même avec une horloge incohérente", () => {
    const r = rythmeDeVente([{ produit: "p", pas: 10, pieces: 5 }], "p", { pasCourant: 10, pasParMois: MOIS, pasParJour: JOUR, pasDebutVente: 50 });
    expect(r.pasObserves).toBe(1);
    expect(Number.isFinite(r.piecesParJour)).toBe(true);
    const sansJour = rythmeDeVente([{ produit: "p", pas: 5, pieces: 5 }], "p", { pasCourant: 10, pasParMois: MOIS, pasParJour: 0, pasDebutVente: null });
    expect(sansJour.piecesParJour).toBe(0);
  });
});

describe("joursDeStock", () => {
  it("divise le stock par les ventes d'un jour", () => {
    expect(joursDeStock(60, 3)).toBe(20);
  });
  it("vaut 0 sans stock, et null (incalculable) sans vente : jamais Infinity ni NaN", () => {
    expect(joursDeStock(0, 3)).toBe(0);
    expect(joursDeStock(0, 0)).toBe(0);
    expect(joursDeStock(10, 0)).toBeNull();
    expect(joursDeStock(10, Number.NaN)).toBeNull();
    expect(joursDeStock(10, Number.POSITIVE_INFINITY)).toBeNull();
  });
  it("reste cohérent avec le rythme affiché : 50 pièces à 100 par jour tiennent une demi-journée", () => {
    expect(joursDeStock(50, 100)).toBe(0.5);
  });
});

describe("textes", () => {
  it("libelleJours", () => {
    expect(libelleJours(null, 30)).toBe("—");
    expect(libelleJours(0, 30)).toBe("0 jour");
    expect(libelleJours(0.01, 30)).toBe("moins d'un jour");
    expect(libelleJours(1.6, 30)).toBe("1 jour");
    expect(libelleJours(12.9, 30)).toBe("12 jours");
    expect(libelleJours(400, 30)).toBe("plus d'un an");
  });
  it("libelleRythme parle en pièces par jour, ou par semaine quand c'est moins d'une par jour", () => {
    expect(libelleRythme(0)).toBe("aucune vente");
    expect(libelleRythme(Number.NaN)).toBe("aucune vente");
    expect(libelleRythme(100)).toBe("100 pièces par jour");
    expect(libelleRythme(1.2)).toBe("1 pièce par jour");
    expect(libelleRythme(1440)).toBe(`${(1440).toLocaleString("fr-FR")} pièces par jour`);
    expect(libelleRythme(0.45)).toBe("environ 3 pièces par semaine");
    expect(libelleRythme(0.01)).toBe("moins d'une pièce par semaine");
  });
  it("libelleVenduDepuis, pour un historique de moins d'un jour", () => {
    expect(libelleVenduDepuis(100, "jeu. 11 h 31")).toBe("100 pièces depuis jeu. 11 h 31");
    expect(libelleVenduDepuis(1, "jeu. 11 h 31")).toBe("1 pièce depuis jeu. 11 h 31");
    expect(libelleVenduDepuis(0, "jeu. 11 h 31")).toBe("aucune vente depuis jeu. 11 h 31");
  });
});

function entree(sur: Partial<EntreeStock> = {}): EntreeStock {
  return {
    produits: [
      { id: "prod_tshirt", nom: "T-shirt", prixDirect: 2500, prixRevendeur: 1200, prixBoutique: null, pasDebutVente: null },
      { id: "prod_chemise", nom: "Chemise", prixDirect: 5900, prixRevendeur: 0, prixBoutique: 6500, pasDebutVente: null },
    ],
    stockAtelier: { prod_tshirt: 20, prod_chemise: 40 },
    stockBoutique: {},
    enRoute: { prod_tshirt: 75 },
    boutiqueOuverte: false,
    mouvements: [
      { produit: "prod_tshirt", pas: 100 * JOUR - 10 * JOUR, pieces: 90 },
      { produit: "prod_chemise", pas: 100 * JOUR - 10 * JOUR, pieces: 30 },
    ],
    pasCourant: 100 * JOUR,
    ...TEMPS,
    seuilJours: 15,
    ...sur,
  };
}

describe("lignesStock", () => {
  it("donne une ligne par produit : stocks, en route, rythme, jours et statut", () => {
    const l = lignesStock(entree());
    const tshirt = l.find((x) => x.id === "prod_tshirt")!;
    expect(tshirt).toMatchObject({
      nom: "T-shirt",
      atelier: 20,
      boutique: 0,
      enRoute: 75,
      disponible: 20,
      piecesParJour: 3,
      piecesObservees: 90,
      depuisMs: null,
      jours: 20 / 3,
      statut: "bas",
    });
    const chemise = l.find((x) => x.id === "prod_chemise")!;
    expect(chemise.jours).toBe(40);
    expect(chemise.statut).toBe("ok");
  });

  it("classe les produits du plus urgent au moins urgent", () => {
    const l = lignesStock(
      entree({
        stockAtelier: { prod_tshirt: 0, prod_chemise: 40 },
      }),
    );
    expect(l.map((x) => x.statut)).toEqual(["rupture", "ok"]);
  });

  it("liste les canaux où le produit est en vente avec leur prix", () => {
    const l = lignesStock(entree());
    expect(l.find((x) => x.id === "prod_tshirt")!.canaux).toEqual([
      { canal: "vente_directe", libelle: "En ligne", prix: 2500, taxe: "TTC" },
      { canal: "revendeur", libelle: "Revendeurs", prix: 1200, taxe: "HT" },
    ]);
    // Sans prix revendeur, pas de revendeur ; sans boutique ouverte, pas de boutique.
    expect(l.find((x) => x.id === "prod_chemise")!.canaux.map((c) => c.canal)).toEqual(["vente_directe"]);
  });

  it("ajoute la boutique ouverte (prix boutique, sinon prix en ligne) et compte son stock", () => {
    const l = lignesStock(entree({ boutiqueOuverte: true, stockBoutique: { prod_tshirt: 10 } }));
    const tshirt = l.find((x) => x.id === "prod_tshirt")!;
    expect(tshirt.canaux.at(-1)).toEqual({ canal: "boutique", libelle: "Boutique", prix: 2500, taxe: "TTC" });
    expect(l.find((x) => x.id === "prod_chemise")!.canaux.at(-1)!.prix).toBe(6500);
    expect(tshirt.disponible).toBe(30);
    expect(tshirt.jours).toBe(10);
  });

  it("repère le stock qui dort : du stock, aucune vente depuis un mois entier", () => {
    const l = lignesStock(entree({ mouvements: [] }));
    expect(l.every((x) => x.statut === "dort")).toBe(true);
    expect(l.every((x) => x.jours === null)).toBe(true);
  });

  it("ne parle pas de stock qui dort pour un produit tout juste ajouté", () => {
    const l = lignesStock(
      entree({
        mouvements: [],
        produits: [{ id: "prod_tshirt", nom: "T-shirt", prixDirect: 2500, prixRevendeur: 0, prixBoutique: null, pasDebutVente: 100 * JOUR - 10 }],
      }),
    );
    expect(l[0]!.statut).toBe("nouveau");
  });

  it("reste lisible quand tout part en un pas : rupture, pas d'Infinity", () => {
    const l = lignesStock(
      entree({
        stockAtelier: { prod_tshirt: 0, prod_chemise: 0 },
        mouvements: [{ produit: "prod_tshirt", pas: 100 * JOUR - 1, pieces: 100 }],
        produits: [{ id: "prod_tshirt", nom: "T-shirt", prixDirect: 2500, prixRevendeur: 0, prixBoutique: null, pasDebutVente: 100 * JOUR - 1 }],
      }),
    );
    expect(l[0]).toMatchObject({ statut: "rupture", jours: 0, piecesParJour: 100 });
  });

  it("donne l'instant du début de l'observation quand le produit est en vente depuis moins d'un jour", () => {
    const debutVenteMs = Date.parse("2026-11-26T10:31:00Z");
    const l = lignesStock(
      entree({
        stockAtelier: { prod_tshirt: 50 },
        mouvements: [{ produit: "prod_tshirt", pas: 100 * JOUR - 30, pieces: 100 }],
        produits: [
          { id: "prod_tshirt", nom: "T-shirt", prixDirect: 2500, prixRevendeur: 0, prixBoutique: null, pasDebutVente: 100 * JOUR - 60, debutVenteMs },
        ],
      }),
    );
    // 100 pièces en une heure : 100 par jour (plancher d'un jour), 50 pièces tiennent une demi-journée.
    expect(l[0]).toMatchObject({ piecesParJour: 100, piecesObservees: 100, depuisMs: debutVenteMs, jours: 0.5, statut: "bas" });
  });
});

describe("produitsEnStockBas", () => {
  it("garde les ruptures et les stocks bas, avec leurs jours", () => {
    const l = lignesStock(entree({ stockAtelier: { prod_tshirt: 20, prod_chemise: 0 } }));
    expect(produitsEnStockBas(l)).toEqual([
      { nom: "Chemise", jours: 0 },
      { nom: "T-shirt", jours: 20 / 3 },
    ]);
  });
});
