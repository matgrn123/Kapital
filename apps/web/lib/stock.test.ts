import { describe, expect, it } from "vitest";
import {
  dureeReelleLisible,
  joursDeStock,
  libelleJours,
  libelleRythme,
  lignesStock,
  mouvementsDeVente,
  produitsEnStockBas,
  rythmeDeVente,
  type EntreeStock,
} from "./stock";

// Un mois de jeu = 1 440 pas (un pas par minute réelle), 30 jours par mois :
// un jour de jeu = 48 pas = 48 minutes réelles.
const PAS_PAR_MOIS = 1440;
const TEMPS = { pasParMois: PAS_PAR_MOIS, joursParMois: 30, minutesReellesParMois: 1440 };

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
      PAS_PAR_MOIS,
    );
    expect(m).toEqual([
      { produit: "prod_tshirt", pas: 2 * PAS_PAR_MOIS + 10, pieces: 5 },
      { produit: "prod_tshirt", pas: 2 * PAS_PAR_MOIS + 11, pieces: 3 },
      { produit: "prod_chemise", pas: 3 * PAS_PAR_MOIS, pieces: 2 },
      { produit: "prod_tshirt", pas: 3 * PAS_PAR_MOIS + 4, pieces: -1 },
    ]);
  });

  it("place au début du mois une écriture sans numéro de pas", () => {
    const m = mouvementsDeVente([{ ecriture_id: "vente_1_x", mois_jeu: 1, libelle: "Vente directe 4 prod_sac_toile" }], PAS_PAR_MOIS);
    expect(m).toEqual([{ produit: "prod_sac_toile", pas: PAS_PAR_MOIS, pieces: 4 }]);
  });
});

describe("rythmeDeVente", () => {
  const mouvements = [
    { produit: "p", pas: 1000, pieces: 50 }, // hors fenêtre (plus d'un mois avant)
    { produit: "p", pas: 3000, pieces: 30 },
    { produit: "p", pas: 3500, pieces: 20 },
    { produit: "p", pas: 3600, pieces: -2 }, // retour
    { produit: "autre", pas: 3500, pieces: 99 },
  ];

  it("compte les ventes nettes du dernier mois de jeu et les ramène à un mois", () => {
    const r = rythmeDeVente(mouvements, "p", { pasCourant: 4000, pasParMois: PAS_PAR_MOIS, pasDebutVente: null });
    expect(r.piecesFenetre).toBe(48);
    expect(r.pasObserves).toBe(PAS_PAR_MOIS);
    expect(r.piecesParMois).toBe(48);
  });

  it("ne compte que le temps écoulé depuis l'arrivée du produit au catalogue", () => {
    const r = rythmeDeVente(mouvements, "p", { pasCourant: 4000, pasParMois: PAS_PAR_MOIS, pasDebutVente: 2800 });
    expect(r.pasObserves).toBe(1200);
    expect(r.piecesParMois).toBeCloseTo((48 * PAS_PAR_MOIS) / 1200);
  });

  it("reste fini quand tout se vend en un seul pas", () => {
    const r = rythmeDeVente([{ produit: "p", pas: 99, pieces: 100 }], "p", {
      pasCourant: 100,
      pasParMois: PAS_PAR_MOIS,
      pasDebutVente: 99,
    });
    expect(r.pasObserves).toBe(1);
    expect(r.piecesParMois).toBe(100 * PAS_PAR_MOIS);
    expect(Number.isFinite(r.piecesParMois)).toBe(true);
  });

  it("vaut 0 sans vente, et jamais moins de 0 si les retours dépassent les ventes", () => {
    expect(rythmeDeVente([], "p", { pasCourant: 4000, pasParMois: PAS_PAR_MOIS, pasDebutVente: null }).piecesParMois).toBe(0);
    const r = rythmeDeVente([{ produit: "p", pas: 3990, pieces: -3 }], "p", {
      pasCourant: 4000,
      pasParMois: PAS_PAR_MOIS,
      pasDebutVente: null,
    });
    expect(r.piecesParMois).toBe(0);
  });

  it("ne divise jamais par zéro, même avec une horloge incohérente", () => {
    const r = rythmeDeVente([{ produit: "p", pas: 10, pieces: 5 }], "p", {
      pasCourant: 10,
      pasParMois: PAS_PAR_MOIS,
      pasDebutVente: 50,
    });
    expect(r.pasObserves).toBe(1);
    expect(Number.isFinite(r.piecesParMois)).toBe(true);
  });
});

describe("joursDeStock", () => {
  it("divise le stock par les ventes d'un jour de jeu", () => {
    expect(joursDeStock(60, 90, 30)).toBe(20);
  });
  it("vaut 0 sans stock, et null (incalculable) sans vente : jamais Infinity ni NaN", () => {
    expect(joursDeStock(0, 90, 30)).toBe(0);
    expect(joursDeStock(0, 0, 30)).toBe(0);
    expect(joursDeStock(10, 0, 30)).toBeNull();
    expect(joursDeStock(10, Number.NaN, 30)).toBeNull();
    expect(joursDeStock(10, Number.POSITIVE_INFINITY, 30)).toBeNull();
  });
  it("reste un petit nombre quand le rythme est très élevé", () => {
    const j = joursDeStock(50, 144_000, 30);
    expect(j).toBeCloseTo(50 / 4800);
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
  it("dureeReelleLisible : un jour de jeu = 48 minutes réelles", () => {
    expect(dureeReelleLisible(null, TEMPS)).toBeNull();
    expect(dureeReelleLisible(0.01, TEMPS)).toBe("moins d'une minute réelle");
    expect(dureeReelleLisible(0.5, TEMPS)).toBe("24 min réelles");
    expect(dureeReelleLisible(5, TEMPS)).toBe("4 h réelles");
    expect(dureeReelleLisible(90, TEMPS)).toBe("3 jours réels");
  });
  it("libelleRythme, lisible quand le rythme est énorme ou nul", () => {
    expect(libelleRythme(0)).toBe("aucune vente");
    expect(libelleRythme(0.4)).toBe("moins d'une pièce / mois");
    expect(libelleRythme(144_000)).toBe("144 000 pièces / mois");
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
      { produit: "prod_tshirt", pas: 3000, pieces: 90 },
      { produit: "prod_chemise", pas: 3000, pieces: 30 },
    ],
    pasCourant: 4000,
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
      piecesParMois: 90,
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
        produits: [{ id: "prod_tshirt", nom: "T-shirt", prixDirect: 2500, prixRevendeur: 0, prixBoutique: null, pasDebutVente: 3990 }],
      }),
    );
    expect(l[0]!.statut).toBe("nouveau");
  });

  it("reste lisible quand tout part en un pas : rupture, pas d'Infinity", () => {
    const l = lignesStock(
      entree({
        stockAtelier: { prod_tshirt: 0, prod_chemise: 0 },
        mouvements: [{ produit: "prod_tshirt", pas: 3999, pieces: 100 }],
        produits: [{ id: "prod_tshirt", nom: "T-shirt", prixDirect: 2500, prixRevendeur: 0, prixBoutique: null, pasDebutVente: 3999 }],
      }),
    );
    expect(l[0]).toMatchObject({ statut: "rupture", jours: 0, piecesParMois: 100 * PAS_PAR_MOIS });
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
