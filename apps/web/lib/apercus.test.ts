import { describe, expect, it } from "vitest";
import { chargerParametresV1 } from "@kapital/content";
import { ACTIONS_MARKETING, coefficientsMarketingDepuisParametres, prixHtDepuisTtc, centimes } from "@kapital/engine";
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

  it("avec ta matière en stock, compte matière + chutes + fournitures + façon, comme le moteur", () => {
    const chute = params["taux_chute_matiere_defaut"]!.valeur;
    const r = apercuFaconnier({
      faconnier,
      produit: "prod_tshirt",
      prixParPiece: 800,
      quantite: 100,
      moisCourant: 2,
      prixVenteTtc: 2500,
      params,
      matiere: { consommationParPiece: 0.8, fournituresParPiece: 60, stock: { quantite: 1000, valeurTotale: 350000 } },
    });
    if (!r.ok) throw new Error(r.message);
    const matiere = Math.round(350 * 100 * 0.8 * (1 + chute));
    expect(r.ecritureLivraison).toEqual([
      { compte: "35", debit: matiere + 100 * (800 + 60) },
      { compte: "31", credit: matiere },
      { compte: "401", credit: 100 * (800 + 60) },
    ]);
    expect(r.coutParPiece).toBe(Math.round((matiere + 100 * 860) / 100));
    expect(equilibreEcriture(r.ecritureLivraison).equilibree).toBe(true);
  });

  it("refuse si ta matière en stock ne suffit pas, comme la route", () => {
    const r = apercuFaconnier({
      faconnier, produit: "prod_tshirt", prixParPiece: 800, quantite: 100, moisCourant: 2, prixVenteTtc: 2500, params,
      matiere: { consommationParPiece: 0.8, fournituresParPiece: 60, stock: { quantite: 10, valeurTotale: 3500 } },
    });
    expect(r.ok).toBe(false);
  });

  it("refuse sous le minimum du façonnier", () => {
    const r = apercuFaconnier({ faconnier, produit: "p", prixParPiece: 800, quantite: 10, moisCourant: 0, prixVenteTtc: null, params });
    expect(r.ok).toBe(false);
  });
});

describe("apercuMarketing", () => {
  const coefficients = coefficientsMarketingDepuisParametres(params);

  it("fait monter la notoriété et baisser la désirabilité avec une promotion", () => {
    const r = apercuMarketing({ action: "promotion", montant: 50000, tresorerie: 100000, marque: { notoriete: 20, desirabilite: 30 }, coefficients, etape: 1 });
    if (!r.ok) throw new Error(r.message);
    expect(r.apres.notoriete).toBeGreaterThan(20);
    expect(r.apres.desirabilite).toBeLessThan(30);
    expect(r.tresorerieApres).toBe(50000);
    expect(r.ecriture).toEqual(ecritureMarketing(50000));
  });

  it("donne le même effet que la route (k × ln(1 + euros))", () => {
    const r = apercuMarketing({ action: "publicite", montant: 50000, tresorerie: 100000, marque: { notoriete: 10, desirabilite: 10 }, coefficients, etape: 1 });
    if (!r.ok) throw new Error(r.message);
    expect(r.apres.notoriete).toBeCloseTo(10 + coefficients.kNotorietePublicite * Math.log(1 + 500), 9);
  });

  it("passe 623 au débit et 512 au crédit, comme la route", () => {
    expect(ecritureMarketing(1234)).toEqual([
      { compte: "623", debit: 1234 },
      { compte: "512", credit: 1234 },
    ]);
  });

  it("refuse si la trésorerie ne suffit pas", () => {
    const r = apercuMarketing({ action: "publicite", montant: 2000, tresorerie: 1000, marque: { notoriete: 0, desirabilite: 0 }, coefficients, etape: 1 });
    expect(r).toEqual({ ok: false, message: "Trésorerie insuffisante : il te manque 10,00 €." });
  });

  const marque = { notoriete: 10, desirabilite: 10 };
  const min = (cle: string) => params[`marketing_montant_min_${cle}`]!.valeur;

  it("refuse un budget sous le minimum de l'action, avec le même message que le serveur", () => {
    const r = apercuMarketing({ action: "influenceur_micro", montant: min("influenceur_micro") - 1, tresorerie: 10 ** 9, marque, coefficients, etape: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/budget minimum est de 200,00 €/);
  });

  it("montre la fourchette de l'aléa d'un influenceur, autour de l'effet moyen", () => {
    const r = apercuMarketing({ action: "influenceur_macro", montant: 200_000, tresorerie: 10 ** 9, marque, coefficients, etape: 1 });
    if (!r.ok) throw new Error(r.message);
    const amp = coefficients.actions.influenceur_macro.amplitudeAlea;
    expect(r.alea).toEqual({ min: 1 - amp, max: 1 + amp });
    expect(r.apresMin.notoriete).toBeLessThan(r.apres.notoriete);
    expect(r.apresMax.notoriete).toBeGreaterThan(r.apres.notoriete);
    expect(r.apresMax.notoriete - 10).toBeCloseTo((r.apres.notoriete - 10) * (1 + amp), 9);
  });

  it("agence : montre les honoraires, l'écriture reste 623 / 512 pour le montant total", () => {
    const r = apercuMarketing({ action: "agence_publicite", montant: 400_000, tresorerie: 10 ** 9, marque, coefficients, etape: 1 });
    if (!r.ok) throw new Error(r.message);
    expect(r.honoraires).toBe(Math.round(400_000 * params["marketing_honoraires_agence_taux"]!.valeur));
    expect(r.ecriture).toEqual(ecritureMarketing(400_000));
  });

  it("réseaux sociaux : nombre d'affichages au coût pour mille des paramètres", () => {
    const r = apercuMarketing({ action: "reseaux_sociaux", montant: 10_000, tresorerie: 10 ** 9, marque, coefficients, etape: 1 });
    if (!r.ok) throw new Error(r.message);
    expect(r.affichages).toBe(Math.floor((10_000 / params["marketing_cpm_reseaux_sociaux"]!.valeur) * 1000));
  });

  it("métro : refusé avant l'étape prévue", () => {
    const etape = params["marketing_etape_min_affichage_metro"]!.valeur;
    const montant = min("affichage_metro");
    expect(apercuMarketing({ action: "affichage_metro", montant, tresorerie: 10 ** 9, marque, coefficients, etape: etape - 1 }).ok).toBe(false);
    expect(apercuMarketing({ action: "affichage_metro", montant, tresorerie: 10 ** 9, marque, coefficients, etape }).ok).toBe(true);
  });

  it("chaque action donne une écriture équilibrée", () => {
    for (const action of ACTIONS_MARKETING) {
      const montant = Math.max(coefficients.actions[action].montantMinimum, 12_345);
      const r = apercuMarketing({ action, montant, tresorerie: 10 ** 9, marque, coefficients, etape: 3 });
      if (!r.ok) throw new Error(r.message);
      expect(equilibreEcriture(r.ecriture).equilibree).toBe(true);
    }
  });
});

describe("texteDelai", () => {
  it("annonce le délai en vrais mois (l'horloge du jeu est l'horloge réelle)", () => {
    expect(texteDelai(2)).toBe("livré en 2 mois");
    expect(texteDelai(1)).toBe("livré en 1 mois");
  });
});

describe("apercuAtelier", () => {
  // Même règle que le moteur (moteur/flux.ts) : bonne matière, consommation × (1 + chute),
  // fournitures payées comptant ; débit 35, crédit 31 et 512.
  const fiche = { consommationParPiece: 0.8, fournituresParPiece: 60 };
  const chute = params["taux_chute_matiere_defaut"]!.valeur;

  it("sort la matière du produit au coût moyen, chute comprise, et paie les fournitures", () => {
    const r = apercuAtelier({ quantite: 40, fiche, stockMatiere: { quantite: 100, valeurTotale: 35000 }, tauxChute: chute });
    if (!r.ok) throw new Error(r.message);
    const besoin = 40 * 0.8 * (1 + chute);
    const matiere = Math.round((35000 / 100) * besoin);
    expect(r.piecesCouvertes).toBe(40);
    expect(r.valeurMatiere).toBe(matiere);
    expect(r.ecritureFabrication).toEqual([
      { compte: "35", debit: matiere + 40 * 60 },
      { compte: "31", credit: matiere },
      { compte: "512", credit: 40 * 60 },
    ]);
    expect(equilibreEcriture(r.ecritureFabrication).equilibree).toBe(true);
  });

  it("plafonne à ce que la matière permet et refuse sans matière ni nomenclature", () => {
    const r = apercuAtelier({ quantite: 500, fiche, stockMatiere: { quantite: 10, valeurTotale: 3500 }, tauxChute: 0 });
    expect(r.ok && r.piecesCouvertes).toBe(12);
    expect(apercuAtelier({ quantite: 5, fiche, stockMatiere: null, tauxChute: 0 }).ok).toBe(false);
    expect(apercuAtelier({ quantite: 5, fiche: null, stockMatiere: { quantite: 10, valeurTotale: 3500 }, tauxChute: 0 }).ok).toBe(false);
  });
});

describe("ecritureMarketing", () => {
  it("passe la publicité au compte du moteur et de la route (623), contre la banque", () => {
    expect(ecritureMarketing(100_00).map((l) => l.compte)).toEqual(["623", "512"]);
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
    const pub = apercuMarketing({ action: "publicite", montant: 30000, tresorerie: 10 ** 9, marque, coefficients, etape: 1 });
    if (!pub.ok) throw new Error(pub.message);
    expect(e.publicite.notoriete).toBeCloseTo(pub.apres.notoriete - 10);
    expect(e.promotion.desirabilite).toBeLessThan(0);
    expect(Object.keys(e).sort()).toEqual([...ACTIONS_MARKETING].sort());
  });
  it("donne la fourchette de l'aléa pour un influenceur, et signale un budget sous le minimum", () => {
    const marque = { notoriete: 10, desirabilite: 20 };
    const e = effetsMarketing({ montant: 30000, marque, coefficients });
    const f = e.influenceur_micro.fourchette;
    if (!f) throw new Error("fourchette attendue");
    expect(f.notoriete[0]).toBeLessThan(e.influenceur_micro.notoriete);
    expect(f.notoriete[1]).toBeGreaterThan(e.influenceur_micro.notoriete);
    expect(e.publicite.fourchette).toBeUndefined();
    expect(e.influenceur_macro.sousMinimum).toBe(true);
    expect(e.influenceur_nano.sousMinimum).toBeUndefined();
  });
  it("rend zéro partout pour un budget nul", () => {
    const e = effetsMarketing({ montant: 0, marque: { notoriete: 5, desirabilite: 5 }, coefficients });
    expect(e.publicite).toEqual({ notoriete: 0, desirabilite: 0 });
  });
});
