import { describe, expect, it } from "vitest";
import { chargerParametresV1 } from "@kapital/content";
import { coefficientsMarketingDepuisParametres, prixHtDepuisTtc, centimes } from "@kapital/engine";
import {
  apercuAtelier,
  apercuCommandeMatiere,
  apercuFaconnier,
  apercuMarketing,
  apercuVente,
  bornesQuantite,
  effetsMarketing,
  ecritureMarketing,
  texteDelai,
} from "./apercus";
import { equilibreEcriture } from "../components/ui/calculs";

const params = chargerParametresV1();
const tva = params["tva_standard"]!.valeur;

describe("apercuVente", () => {
  it("rend l'écriture du moteur pour une pièce vendue en direct et chez un revendeur", () => {
    const r = apercuVente({ produit: "prod_tshirt", prixTtc: 2500, prixGrosHt: 1200, coutRevient: 900, params, mois: 3 });
    if (!r.ok) throw new Error(r.message);
    const ht = prixHtDepuisTtc(centimes(2500), tva);
    expect(r.prixHt).toBe(ht);
    expect(r.tva).toBe(2500 - ht);
    expect(r.ecritureDirecte).toEqual([
      { compte: "512", debit: 2500 },
      { compte: "707", credit: ht },
      { compte: "44571", credit: 2500 - ht },
      { compte: "7135", debit: 900 },
      { compte: "35", credit: 900 },
    ]);
    expect(r.ecritureRevendeur).toEqual([
      { compte: "411", debit: 1200 },
      { compte: "707", credit: 1200 },
      { compte: "7135", debit: 900 },
      { compte: "35", credit: 900 },
    ]);
    expect(r.margeRevendeur).toBe(300);
    expect(equilibreEcriture(r.ecritureDirecte).equilibree).toBe(true);
  });

  it("refuse un prix nul ou un coût inconnu", () => {
    expect(apercuVente({ produit: "p", prixTtc: 0, prixGrosHt: 1, coutRevient: 1, params, mois: 0 }).ok).toBe(false);
    expect(apercuVente({ produit: "p", prixTtc: 10, prixGrosHt: 1, coutRevient: 0, params, mois: 0 }).ok).toBe(false);
  });
});

const fournisseur = { id: "four_a", nom: "Filature A", delaiMois: 2, minimumCommande: 50 };

describe("apercuCommandeMatiere", () => {
  it("donne l'écriture que le moteur passera à la livraison (31 / 401)", () => {
    const r = apercuCommandeMatiere({ fournisseur, matiere: "mat_jersey", prixUnitaire: 450, quantite: 100, moisCourant: 4, params });
    if (!r.ok) throw new Error(r.message);
    expect(r.total).toBe(45000);
    expect(r.moisLivraison).toBe(6);
    expect(r.ecritureLivraison).toEqual([
      { compte: "31", debit: 45000 },
      { compte: "401", credit: 45000 },
    ]);
  });

  it("refuse sous le minimum avec un message clair", () => {
    const r = apercuCommandeMatiere({ fournisseur, matiere: "m", prixUnitaire: 450, quantite: 10, moisCourant: 0, params });
    expect(r).toEqual({ ok: false, message: "Filature A n'accepte pas moins de 50 unités par commande." });
  });
});

describe("apercuFaconnier", () => {
  const faconnier = { id: "fac_pt", nom: "Atelier Porto", pays: "Portugal", delaiMois: 1, minimumCommande: 75 };

  it("donne l'écriture de livraison du moteur (35 / 401) et la marge par pièce", () => {
    const r = apercuFaconnier({ faconnier, produit: "prod_tshirt", prixParPiece: 800, quantite: 100, moisCourant: 2, prixVenteTtc: 2500, params });
    if (!r.ok) throw new Error(r.message);
    expect(r.total).toBe(80000);
    expect(r.moisLivraison).toBe(3);
    expect(r.ecritureLivraison).toEqual([
      { compte: "35", debit: 80000 },
      { compte: "401", credit: 80000 },
    ]);
    expect(r.margeParPiece).not.toBeNull();
  });

  it("refuse sous le minimum du façonnier", () => {
    const r = apercuFaconnier({ faconnier, produit: "p", prixParPiece: 800, quantite: 10, moisCourant: 0, prixVenteTtc: null, params });
    expect(r.ok).toBe(false);
  });
});

describe("apercuMarketing", () => {
  const coefficients = coefficientsMarketingDepuisParametres(params);

  it("fait monter la notoriété et baisser la désirabilité avec une promotion", () => {
    const r = apercuMarketing({ action: "promotion", montant: 50000, tresorerie: 100000, marque: { notoriete: 20, desirabilite: 30 }, coefficients });
    if (!r.ok) throw new Error(r.message);
    expect(r.apres.notoriete).toBeGreaterThan(20);
    expect(r.apres.desirabilite).toBeLessThan(30);
    expect(r.tresorerieApres).toBe(50000);
    expect(r.ecriture).toEqual(ecritureMarketing(50000));
  });

  it("donne le même effet que la route (k × ln(1 + euros))", () => {
    const r = apercuMarketing({ action: "publicite", montant: 50000, tresorerie: 100000, marque: { notoriete: 10, desirabilite: 10 }, coefficients });
    if (!r.ok) throw new Error(r.message);
    expect(r.apres.notoriete).toBeCloseTo(10 + coefficients.kNotorietePublicite * Math.log(1 + 500), 9);
  });

  it("passe 6228 au débit et 512 au crédit, comme la route", () => {
    expect(ecritureMarketing(1234)).toEqual([
      { compte: "6228", debit: 1234 },
      { compte: "512", credit: 1234 },
    ]);
  });

  it("refuse si la trésorerie ne suffit pas", () => {
    const r = apercuMarketing({ action: "publicite", montant: 2000, tresorerie: 1000, marque: { notoriete: 0, desirabilite: 0 }, coefficients });
    expect(r).toEqual({ ok: false, message: "Trésorerie insuffisante : il te manque 10,00 €." });
  });
});

describe("texteDelai", () => {
  it("convertit les mois de jeu en temps réel avec le ratio des paramètres", () => {
    const parMois = params["temps_minutes_reelles_par_mois_jeu"]!.valeur;
    expect(parMois).toBe(1440);
    expect(texteDelai(2, params)).toBe("2 mois de jeu (2 jours réels)");
    expect(texteDelai(1, params)).toBe("1 mois de jeu (1 jour réel)");
  });
});

describe("apercuAtelier", () => {
  it("sort la matière au coût moyen, une unité par pièce, comme le moteur", () => {
    const r = apercuAtelier({ quantite: 40, stockMatiere: { quantite: 100, valeurTotale: 35000 } });
    if (!r.ok) throw new Error(r.message);
    expect(r.piecesCouvertes).toBe(40);
    expect(r.ecritureFabrication).toEqual([
      { compte: "35", debit: 14000 },
      { compte: "31", credit: 14000 },
    ]);
  });

  it("plafonne au stock et refuse un stock vide", () => {
    const r = apercuAtelier({ quantite: 500, stockMatiere: { quantite: 100, valeurTotale: 35000 } });
    expect(r.ok && r.piecesCouvertes).toBe(100);
    expect(apercuAtelier({ quantite: 5, stockMatiere: null }).ok).toBe(false);
  });
});

describe("bornesQuantite", () => {
  it("part du minimum et monte jusqu'au plafond tiré des données", () => {
    expect(bornesQuantite({ minimum: 50, plafonds: [120, 400] })).toEqual({ min: 50, max: 400 });
  });
  it("ne descend jamais sous le minimum ni sous 1, ignore les plafonds invalides", () => {
    expect(bornesQuantite({ minimum: 50, plafonds: [10, Number.NaN] })).toEqual({ min: 50, max: 50 });
    expect(bornesQuantite({ minimum: 0, plafonds: [] })).toEqual({ min: 1, max: 1 });
    expect(bornesQuantite({ minimum: 1, plafonds: [12.7] })).toEqual({ min: 1, max: 12 });
  });
});

describe("effetsMarketing", () => {
  const coefficients = coefficientsMarketingDepuisParametres(params);
  it("donne l'écart de chaque jauge pour les quatre actions, comme apercuMarketing", () => {
    const marque = { notoriete: 10, desirabilite: 20 };
    const e = effetsMarketing({ montant: 30000, marque, coefficients });
    const pub = apercuMarketing({ action: "publicite", montant: 30000, tresorerie: 10 ** 9, marque, coefficients });
    if (!pub.ok) throw new Error(pub.message);
    expect(e.publicite.notoriete).toBeCloseTo(pub.apres.notoriete - 10);
    expect(e.promotion.desirabilite).toBeLessThan(0);
    expect(Object.keys(e).sort()).toEqual(["image_marque", "promotion", "publicite", "relations_presse"]);
  });
  it("rend zéro partout pour un budget nul", () => {
    const e = effetsMarketing({ montant: 0, marque: { notoriete: 5, desirabilite: 5 }, coefficients });
    expect(e.publicite).toEqual({ notoriete: 0, desirabilite: 0 });
  });
});
