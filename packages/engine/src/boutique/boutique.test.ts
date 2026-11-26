import { chargerBatimentsV1, chargerParametresV1, type TypeBatiment } from "@kapital/content";
import { describe, expect, it } from "vitest";
import {
  enEquilibre,
  enregistrer,
  planComptableV1,
  soldeCompte,
  totalActif,
  totalPassif,
  resultat,
  type EcritureComptable,
} from "../comptabilite/index.js";
import { calculerVentesMois, facteurDemandeBoutique } from "../marche/ventesMois.js";
import { cumulVide, type CumulMois } from "../moteur/donneesMois.js";
import { avancerFlux } from "../moteur/flux.js";
import { cloturerMois } from "../moteur/cloture.js";
import { simulerMoisEntreprise } from "../moteur/simulerMois.js";
import { debutDuMoisMs, finDuMoisMs, indexDuMois } from "../moteur/temps.js";
import { coefficientsSalairesDepuisParametres, coutEmployeur } from "../salaires/calculs.js";
import { margeParCanal, parametresIndicateursDepuis } from "../indicateurs/indicateurs.js";
import type { Entreprise, PointDeVente, Salarie } from "../types/entreprise.js";
import { centimes, graine, idEntreprise, idProduit, idSalarie, moisJeu } from "../types/primitifs.js";
import {
  apercuOuvertureBoutique,
  boutiqueEnTravaux,
  boutiqueOuverte,
  ecrituresClotureBoutique,
  ecrituresOuvertureBoutique,
  nouveauPointDeVente,
  passantsReferenceBoutiques,
  pointMortBoutique,
  pointMortBoutiqueEntreprise,
  premierPasOuvert,
  transfererStockVersBoutique,
  valeurSortieCmp,
} from "./boutique.js";

const PARAMS = chargerParametresV1();
const BATIMENTS = chargerBatimentsV1();
const TSHIRT = idProduit("prod_tshirt");
const REF = passantsReferenceBoutiques(BATIMENTS);

function batiment(id: string): TypeBatiment {
  const b = BATIMENTS.find((x) => x.id === id);
  if (!b) throw new Error(id);
  return b;
}

const HEURE = 3_600_000;
const TRAVAUX_MS = PARAMS["boutique_travaux_duree_heures"]!.valeur * HEURE;

/**
 * Boutique « quartier des créateurs » signée au mois 3, une heure avant la fin du mois : les
 * 24 h de travaux la font ouvrir au mois 4 (le mois 3 est tout entier « en travaux »).
 */
function boutique(stock = 0, valeur = 0, o: Partial<PointDeVente> = {}): PointDeVente {
  const pdv = nouveauPointDeVente({
    id: "pdv_1",
    batiment: batiment("boutique_quartier_createurs"),
    mois: moisJeu(3),
    instantMs: finDuMoisMs(3) - HEURE,
    params: PARAMS,
    passantsReference: REF,
  });
  return {
    ...pdv,
    stock: stock > 0 ? [{ produit: TSHIRT, quantite: stock, valeurTotale: centimes(valeur) }] : [],
    ...o,
  };
}

function vendeur(n: number): Salarie {
  return {
    id: idSalarie(`vendeur_${n}`),
    poste: "vendeur",
    salaireBrutMensuel: centimes(PARAMS["vendeur_salaire_brut_mensuel_centimes"]!.valeur),
    ancienneteMois: 0,
    experienceMois: 0,
  };
}

function entreprise(o: Partial<Entreprise> = {}): Entreprise {
  return {
    id: idEntreprise("ent_boutique"),
    nom: "Boutique SAS",
    gamme: "milieu",
    etape: 2,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(5_000_000),
    stocksMatiere: [],
    stocksFinis: [],
    salaries: [],
    ateliers: [],
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [],
    catalogue: [
      {
        produit: TSHIRT,
        qualiteVisee: 60,
        prix: { vente_directe: centimes(6000), revendeur: centimes(0) },
        productionMensuelleCible: 0,
      },
    ],
    pointsDeVente: [boutique(10_000, 20_000_000)],
    ...o,
  };
}

const DONNEES = { livraisonsMatiere: [], livraisonsFaconniers: [], depensesMarketing: [], creancesAEncaisser: [] };

function flux(e: Entreprise, mois: number, pas = { debut: 0, fin: 1, parMois: 1 }, cumul?: CumulMois) {
  return avancerFlux(e, cumul ?? cumulVide(moisJeu(mois), e.tresorerie), DONNEES, {
    params: PARAMS,
    mois: moisJeu(mois),
    pasDebut: pas.debut,
    pasFin: pas.fin,
    pasParMois: pas.parMois,
    suffixeId: pas.parMois === 1 ? "" : `_p${pas.debut}`,
  });
}

function venduEnBoutique(c: CumulMois): number {
  return c.serviParLigne[`${TSHIRT}|boutique`] ?? 0;
}

function stockBoutique(e: Entreprise): number {
  return (e.pointsDeVente ?? []).flatMap((p) => p.stock).reduce((s, l) => s + l.quantite, 0);
}

function gl(ecritures: readonly EcritureComptable[]) {
  return ecritures.reduce(enregistrer, planComptableV1());
}

describe("AE-10 : ouverture d'une boutique (aperçu et écritures)", () => {
  it("dépôt = 3 mois de loyer, travaux = surface × 500 €/m², ouverture 24 h après la signature", () => {
    // Signature le jeudi 26 novembre 2026 à 10 h 21 (heure de Paris, 9 h 21 UTC).
    const novembre = indexDuMois(2026, 11);
    const signature = Date.UTC(2026, 10, 26, 9, 21);
    const a = apercuOuvertureBoutique({
      batiment: batiment("boutique_quartier_createurs"),
      params: PARAMS,
      mois: novembre,
      instantMs: signature,
      tresorerie: centimes(2_000_000),
    });
    expect(a.depotGarantie).toBe(3 * 76_500);
    expect(a.travaux).toBe(45 * 50_000);
    expect(a.totalALaSignature).toBe(229_500 + 2_250_000);
    expect(a.dureeTravauxHeures).toBe(24);
    expect(a.ouvertureMs).toBe(Date.UTC(2026, 10, 27, 9, 21));
    expect(a.moisOuverture).toBe(novembre);
    expect(a.amortissementMensuel).toBe(2_250_000 / 120);
    expect(a.etapeRequise).toBe(3);
    expect(a.tresorerieSuffisante).toBe(false);
    expect(a.manque).toBe(2_479_500 - 2_000_000);
  });

  it("signée le 30 novembre au soir, elle ouvre le 1er décembre : le mois d'ouverture suit l'instant", () => {
    const novembre = indexDuMois(2026, 11);
    const a = apercuOuvertureBoutique({
      batiment: batiment("boutique_quartier_createurs"),
      params: PARAMS,
      mois: novembre,
      instantMs: finDuMoisMs(novembre) - 2 * HEURE,
      tresorerie: centimes(0),
    });
    expect(a.ouvertureMs).toBe(finDuMoisMs(novembre) + 22 * HEURE);
    expect(a.moisOuverture).toBe(novembre + 1);
  });

  it("sans instant de signature : début du mois de signature (banc d'essai, aperçus)", () => {
    const a = apercuOuvertureBoutique({
      batiment: batiment("boutique_quartier_createurs"),
      params: PARAMS,
      mois: moisJeu(3),
      tresorerie: centimes(0),
    });
    expect(a.ouvertureMs).toBe(debutDuMoisMs(3) + TRAVAUX_MS);
    expect(a.moisOuverture).toBe(3);
  });

  it("le point de vente enregistré porte l'instant d'ouverture de l'aperçu", () => {
    const signature = Date.UTC(2026, 10, 26, 9, 21);
    const pdv = nouveauPointDeVente({
      id: "x",
      batiment: batiment("boutique_quartier_createurs"),
      mois: indexDuMois(2026, 11),
      instantMs: signature,
      params: PARAMS,
      passantsReference: REF,
    });
    expect(pdv.ouvertureMs).toBe(signature + TRAVAUX_MS);
    expect(pdv.moisSignature).toBe(pdv.moisOuverture);
  });

  it("refuse un bâtiment qui n'est pas une boutique", () => {
    expect(() =>
      apercuOuvertureBoutique({ batiment: batiment("petit_atelier"), params: PARAMS, mois: moisJeu(0), tresorerie: centimes(0) }),
    ).toThrow(/boutique/);
  });

  it("écritures d'ouverture : 275 / 512 et 2135 / 512, équilibrées", () => {
    const g = gl(ecrituresOuvertureBoutique(boutique()));
    expect(soldeCompte(g, "275")).toBe(229_500);
    expect(soldeCompte(g, "2135")).toBe(2_250_000);
    expect(soldeCompte(g, "512")).toBe(-2_479_500);
    expect(enEquilibre(g)).toBe(true);
  });

  it("passants de référence : moyenne des boutiques du catalogue", () => {
    expect(REF).toBe(Math.round((2500 + 6000 + 10000) / 3));
  });
});

describe("AE-10 : transfert du stock de l'atelier vers la boutique", () => {
  it("déplace les pièces au coût moyen, sans écriture : la valeur totale ne change pas", () => {
    const e = entreprise({
      stocksFinis: [{ produit: TSHIRT, quantite: 30, valeurTotale: centimes(60_001) }],
      pointsDeVente: [boutique()],
    });
    const r = transfererStockVersBoutique(e, "pdv_1", TSHIRT, 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur).toBe(20_000);
    expect(r.entreprise.stocksFinis[0]).toEqual({ produit: TSHIRT, quantite: 20, valeurTotale: 40_001 });
    expect(r.entreprise.pointsDeVente![0]!.stock).toEqual([{ produit: TSHIRT, quantite: 10, valeurTotale: 20_000 }]);
    // Tout le reste : toute la valeur, sans reste d'arrondi.
    const r2 = transfererStockVersBoutique(r.entreprise, "pdv_1", TSHIRT, 20);
    expect(r2.ok && r2.entreprise.stocksFinis[0]!.valeurTotale).toBe(0);
    expect(r2.ok && r2.entreprise.pointsDeVente![0]!.stock[0]!.valeurTotale).toBe(60_001);
  });

  it("refuse plus que le stock de l'atelier, une quantité invalide, une boutique inconnue", () => {
    const e = entreprise({ stocksFinis: [{ produit: TSHIRT, quantite: 5, valeurTotale: centimes(10_000) }] });
    expect(transfererStockVersBoutique(e, "pdv_1", TSHIRT, 6)).toMatchObject({ ok: false, code: "stock_insuffisant" });
    expect(transfererStockVersBoutique(e, "pdv_1", TSHIRT, 0)).toMatchObject({ ok: false, code: "quantite_invalide" });
    expect(transfererStockVersBoutique(e, "pdv_x", TSHIRT, 1)).toMatchObject({ ok: false, code: "boutique_introuvable" });
  });

  it("valeurSortieCmp arrondit au centime le plus proche", () => {
    expect(valeurSortieCmp({ produit: TSHIRT, quantite: 3, valeurTotale: centimes(100) }, 1)).toBe(33);
    expect(valeurSortieCmp({ produit: TSHIRT, quantite: 3, valeurTotale: centimes(100) }, 2)).toBe(67);
  });
});

describe("AE-10 : ventes en boutique (critère d'acceptation)", () => {
  it("la demande de la boutique dépasse largement le plafond des vendeurs (sanité du test)", () => {
    const e = entreprise({ salaries: [vendeur(1), vendeur(2)] });
    const v = calculerVentesMois(
      { moisCourant: moisJeu(4), entreprises: [e], prixMatieres: [], franges: [], evenements: [] },
      1,
      PARAMS,
    ).find((x) => x.canal === "boutique");
    expect(v?.quantite ?? 0).toBeGreaterThan(600);
  });

  it("sans vendeur : aucune vente", () => {
    const r = flux(entreprise(), 4);
    expect(venduEnBoutique(r.cumul)).toBe(0);
    expect(stockBoutique(r.entreprise)).toBe(10_000);
    expect(r.ecritures.some((x) => x.id.endsWith("_boutique"))).toBe(false);
  });

  it("sans stock en boutique : aucune vente, même avec un vendeur et du stock à l'atelier", () => {
    const r = flux(
      entreprise({
        salaries: [vendeur(1)],
        pointsDeVente: [boutique()],
        stocksFinis: [{ produit: TSHIRT, quantite: 500, valeurTotale: centimes(1_000_000) }],
      }),
      4,
    );
    expect(venduEnBoutique(r.cumul)).toBe(0);
    expect(r.ecritures.some((x) => x.id.endsWith("_boutique"))).toBe(false);
  });

  it("pendant les travaux : aucune vente", () => {
    const r = flux(entreprise({ salaries: [vendeur(1)] }), 3);
    expect(venduEnBoutique(r.cumul)).toBe(0);
    expect(stockBoutique(r.entreprise)).toBe(10_000);
    expect(facteurDemandeBoutique(entreprise(), moisJeu(3))).toBe(0);
  });

  it("plafond des vendeurs : 2 vendeurs × 300 pièces = 600 pièces au plus", () => {
    const r = flux(entreprise({ salaries: [vendeur(1), vendeur(2)] }), 4);
    expect(venduEnBoutique(r.cumul)).toBe(2 * PARAMS["vendeur_ventes_max_pieces_par_mois"]!.valeur);
    expect(stockBoutique(r.entreprise)).toBe(10_000 - 600);
  });

  it("le plafond est le même mois découpé en pas", () => {
    const e = entreprise({ salaries: [vendeur(1)] });
    let cumul = cumulVide(moisJeu(4), e.tresorerie);
    let courant = e;
    for (let i = 0; i < 7; i++) {
      const r = flux(courant, 4, { debut: i, fin: i + 1, parMois: 7 }, cumul);
      cumul = { ...r.cumul, pasTraites: i + 1 };
      courant = r.entreprise;
    }
    expect(venduEnBoutique(cumul)).toBe(300);
  });

  it("stock limitant : on vend le stock de la boutique, pas plus", () => {
    const r = flux(entreprise({ salaries: [vendeur(1)], pointsDeVente: [boutique(40, 80_000)] }), 4);
    expect(venduEnBoutique(r.cumul)).toBe(40);
    expect(stockBoutique(r.entreprise)).toBe(0);
  });

  it("écriture de vente : 512 TTC, 707 HT, 44571 TVA, 7135 / 35 au coût moyen de la boutique", () => {
    const r = flux(entreprise({ salaries: [vendeur(1)], pointsDeVente: [boutique(100, 200_000)] }), 4);
    const vente = r.ecritures.find((x) => x.id === `vente_4_ent_boutique_${TSHIRT}_boutique`);
    expect(vente?.lignes).toEqual([
      { compte: "512", sens: "debit", montant: 100 * 6000 },
      { compte: "707", sens: "credit", montant: 100 * 5000 },
      { compte: "44571", sens: "credit", montant: 100 * 1000 },
      { compte: "7135", sens: "debit", montant: 200_000 },
      { compte: "35", sens: "credit", montant: 200_000 },
    ]);
    expect(r.cumul.chiffreAffairesHt).toBe(500_000);
  });

  it("prix boutique : celui fixé, sinon le prix de la vente directe", () => {
    const base = entreprise({ salaries: [vendeur(1)], pointsDeVente: [boutique(10, 20_000)] });
    const avecPrix = {
      ...base,
      catalogue: base.catalogue.map((p) => ({ ...p, prix: { ...p.prix, boutique: centimes(7200) } })),
    };
    const r = flux(avecPrix, 4);
    const vente = r.ecritures.find((x) => x.id.endsWith("_boutique"));
    expect(vente?.lignes[0]).toEqual({ compte: "512", sens: "debit", montant: 10 * 7200 });
  });

  it("un emplacement plus passant crée plus de demande (passants / référence)", () => {
    const rue = { ...boutique(), passantsParJour: 10_000 };
    const quartier = { ...boutique(), passantsParJour: 2_500 };
    expect(facteurDemandeBoutique(entreprise({ pointsDeVente: [rue] }), moisJeu(4))).toBeCloseTo(10_000 / REF);
    expect(facteurDemandeBoutique(entreprise({ pointsDeVente: [quartier] }), moisJeu(4))).toBeCloseTo(2_500 / REF);
  });

  it("une boutique ouverte ajoute son bonus de désirabilité, pas pendant les travaux", () => {
    const pendant = flux(entreprise(), 3).entreprise.marque.desirabilite;
    const ouverte = flux(entreprise(), 4).entreprise.marque.desirabilite;
    expect(ouverte - pendant).toBeCloseTo(0.8);
  });
});

describe("AE-10 : clôture du mois d'une boutique", () => {
  it("pendant les travaux : loyer et charges, pas d'amortissement", () => {
    const r = ecrituresClotureBoutique(boutique(), moisJeu(3));
    const g = gl(r.ecritures);
    // T4 : signée le dernier jour du mois (avril 1970, 30 jours) : 1/30 du loyer et des charges.
    expect(soldeCompte(g, "613")).toBe(2550);
    expect(soldeCompte(g, "614")).toBe(375);
    expect(soldeCompte(g, "28135")).toBe(0);
    expect(enEquilibre(g)).toBe(true);
  });

  it("ouverte : amortissement des agencements 681 / 28135, cumulé dans l'état", () => {
    const r = ecrituresClotureBoutique(boutique(), moisJeu(4));
    expect(soldeCompte(gl(r.ecritures), "28135")).toBe(18_750);
    expect(r.pointDeVente.agencement.amortissementsCumules).toBe(18_750);
  });

  it("l'amortissement s'arrête quand tout est amorti", () => {
    const pdv = boutique();
    const presque = { ...pdv, agencement: { ...pdv.agencement, amortissementsCumules: centimes(2_250_000 - 100) } };
    expect(soldeCompte(gl(ecrituresClotureBoutique(presque, moisJeu(200)).ecritures), "28135")).toBe(100);
    const fini = { ...pdv, agencement: { ...pdv.agencement, amortissementsCumules: centimes(2_250_000) } };
    expect(ecrituresClotureBoutique(fini, moisJeu(201)).ecritures.some((x) => x.id.startsWith("boutique_amort_"))).toBe(false);
  });

  it("un mois complet avec boutique : actif = passif + résultat, banque et stocks = grand livre", () => {
    // Ouverture au mois 3, transfert de 200 pièces, un mois de travaux, puis un mois de ventes.
    const pdv = boutique();
    const apport = {
      id: "apport",
      mois: moisJeu(0),
      libelle: "Apport",
      lignes: [
        { compte: "512", sens: "debit" as const, montant: centimes(5_000_000) },
        { compte: "101", sens: "credit" as const, montant: centimes(5_000_000) },
      ],
    };
    const stockAtelier = {
      id: "stock",
      mois: moisJeu(0),
      libelle: "Série",
      lignes: [
        { compte: "35", sens: "debit" as const, montant: centimes(400_000) },
        { compte: "512", sens: "credit" as const, montant: centimes(400_000) },
      ],
    };
    let ecritures: EcritureComptable[] = [apport, stockAtelier, ...ecrituresOuvertureBoutique(pdv)];
    let e = entreprise({
      tresorerie: centimes(5_000_000 - 400_000 - 2_479_500),
      stocksFinis: [{ produit: TSHIRT, quantite: 200, valeurTotale: centimes(400_000) }],
      pointsDeVente: [pdv],
      salaries: [vendeur(1)],
    });
    const t = transfererStockVersBoutique(e, "pdv_1", TSHIRT, 200);
    if (!t.ok) throw new Error(t.message);
    e = t.entreprise;
    const fin = { tvaAPayerCeMois: centimes(0), moisDecouvertConsecutifs: 0 };
    for (const mois of [3, 4]) {
      const r = simulerMoisEntreprise(e, { ...DONNEES, ...fin }, {} as never, PARAMS, graine(1), moisJeu(mois));
      ecritures = [...ecritures, ...r.ecritures];
      e = r.entrepriseApres;
    }
    const g = gl(ecritures);
    expect(enEquilibre(g)).toBe(true);
    expect(totalActif(g)).toBe(totalPassif(g) + resultat(g));
    expect(e.tresorerie).toBe(soldeCompte(g, "512"));
    expect(stockBoutique(e)).toBe(0);
    const valeurStocks =
      e.stocksFinis.reduce((s, l) => s + l.valeurTotale, 0) +
      (e.pointsDeVente ?? []).flatMap((p) => p.stock).reduce((s, l) => s + l.valeurTotale, 0);
    expect(valeurStocks).toBe(soldeCompte(g, "35"));
    expect(soldeCompte(g, "707")).toBe(200 * 5000);
    expect(soldeCompte(g, "28135")).toBe(18_750);
  });
});

describe("AE-10 : point mort de la boutique", () => {
  it("(loyer + charges + vendeurs + amortissement) ÷ marge par pièce, calcul à la main", () => {
    const c = coefficientsSalairesDepuisParametres(PARAMS);
    const salaire = PARAMS["vendeur_salaire_brut_mensuel_centimes"]!.valeur;
    const coutVendeur = coutEmployeur({
      salaireBrutMensuel: centimes(salaire),
      smicMensuelBrut: c.smicMensuelBrut,
      tauxCotisationsSmic: c.tauxCotisationsSmic,
      tauxCotisationsPleines: c.tauxCotisationsPleines,
      seuilCotisationsPleinesEnSmic: c.seuilCotisationsPleinesEnSmic,
    });
    // 60 € TTC → 50 € HT ; coût de revient 20 € → marge 30 € par pièce.
    const pm = pointMortBoutique({
      pointDeVente: boutique(),
      salaries: [vendeur(1)],
      margeParPiece: centimes(3000),
      params: PARAMS,
    });
    const fixes = 76_500 + 11_250 + coutVendeur + 18_750;
    expect(pm.chargesFixes).toBe(fixes);
    expect(pm.vendeurs).toBe(coutVendeur);
    expect(pm.amortissement).toBe(18_750);
    expect(pm.piecesPointMort).toBe(Math.ceil(fixes / 3000));
    expect(pm.capaciteVendeurs).toBe(300);
    expect(pm.horsDePortee).toBe(pm.piecesPointMort! > 300);
  });

  it("depuis l'entreprise : marge moyenne du stock de la boutique", () => {
    const e = entreprise({ salaries: [vendeur(1)], pointsDeVente: [boutique(100, 200_000)] });
    const pm = pointMortBoutiqueEntreprise(e, "pdv_1", PARAMS);
    expect(pm.margeParPiece).toBe(3000);
  });

  it("marge nulle ou inconnue : pas de point mort", () => {
    const pm = pointMortBoutique({ pointDeVente: boutique(), salaries: [], margeParPiece: null, params: PARAMS });
    expect(pm.piecesPointMort).toBeNull();
    expect(pm.horsDePortee).toBe(true);
  });

  it("indicateurs : marge du canal boutique = prix HT − coût, sans retour", () => {
    const e = entreprise();
    const m = margeParCanal(e, { [`${TSHIRT}|boutique`]: 10 }, { [TSHIRT]: centimes(2000) }, parametresIndicateursDepuis(PARAMS));
    expect(m.parCanal.boutique).toEqual({ pieces: 10, chiffreAffairesHt: 50_000, margeBrute: 30_000 });
    expect(m.total.pieces).toBe(10);
  });
});

describe("AE-10 : clôture complète", () => {
  it("les ventes boutique ne sont pas comptées en « stock insuffisant »", () => {
    // Pas de vente en ligne (prix direct à 0) : seule la boutique a une demande, sans vendeur.
    const base = entreprise();
    const e = {
      ...base,
      catalogue: base.catalogue.map((p) => ({
        ...p,
        prix: { vente_directe: centimes(0), revendeur: centimes(0), boutique: centimes(6000) },
      })),
    };
    const f = flux(e, 4);
    expect(f.cumul.demandeParLigne[`${TSHIRT}|boutique`]).toBeGreaterThan(0);
    const r = cloturerMois(f.entreprise, f.cumul, { tvaAPayerCeMois: centimes(0), moisDecouvertConsecutifs: 0 }, PARAMS, moisJeu(4));
    expect(r.ventesPerdues).toEqual([]);
  });
});

describe("T3 : la boutique ouvre à l'instant où les travaux finissent", () => {
  // Signée le mardi 10 novembre 2026 à 12 h (heure de Paris) : ouverte le 11 novembre à 12 h.
  const novembre = indexDuMois(2026, 11);
  const signature = Date.UTC(2026, 10, 10, 11, 0);
  const ouverture = signature + TRAVAUX_MS;
  /** Heures écoulées depuis le 1er novembre à minuit jusqu'à l'ouverture : 10 jours et 12 h. */
  const HEURE_OUVERTURE = 10 * 24 + 12;
  const pdvNovembre = (): PointDeVente => ({
    ...nouveauPointDeVente({
      id: "pdv_1",
      batiment: batiment("boutique_quartier_createurs"),
      mois: novembre,
      instantMs: signature,
      params: PARAMS,
      passantsReference: REF,
    }),
    stock: [{ produit: TSHIRT, quantite: 10_000, valeurTotale: centimes(20_000_000) }],
  });

  it("ouverte ou en travaux, à l'instant près", () => {
    const pdv = pdvNovembre();
    expect(ouverture - debutDuMoisMs(novembre)).toBe(HEURE_OUVERTURE * HEURE);
    expect(boutiqueOuverte(pdv, novembre, ouverture - 60_000)).toBe(false);
    expect(boutiqueEnTravaux(pdv, novembre, ouverture - 60_000)).toBe(true);
    expect(boutiqueOuverte(pdv, novembre, ouverture)).toBe(true);
    expect(boutiqueEnTravaux(pdv, novembre, ouverture)).toBe(false);
    // Sans instant (clôture du mois) : comparée au mois d'ouverture.
    expect(boutiqueOuverte(pdv, novembre)).toBe(true);
  });

  it("une boutique non datée (enregistrée avant la migration 0045) reste comparée au mois", () => {
    const ancienne: PointDeVente = { ...boutique(), ouvertureMs: undefined };
    expect(boutiqueOuverte(ancienne, moisJeu(3), finDuMoisMs(3))).toBe(false);
    expect(boutiqueOuverte(ancienne, moisJeu(4), debutDuMoisMs(4))).toBe(true);
  });

  it("premier pas ouvert du mois : 0 si elle était déjà ouverte, sinon le pas de l'ouverture", () => {
    expect(premierPasOuvert([pdvNovembre()], novembre, 720)).toBe(HEURE_OUVERTURE);
    expect(premierPasOuvert([pdvNovembre()], moisJeu(novembre + 1), 744)).toBe(0);
    expect(premierPasOuvert([pdvNovembre()], novembre, 1)).toBe(0);
  });

  it("en pas d'une heure : rien avant l'ouverture, puis le plafond des vendeurs compté depuis l'ouverture", () => {
    const heures = (finDuMoisMs(novembre) - debutDuMoisMs(novembre)) / HEURE;
    expect(heures).toBe(720);
    const e = entreprise({ salaries: [vendeur(1)], pointsDeVente: [pdvNovembre()] });
    let cumul = cumulVide(novembre, e.tresorerie);
    let courant = e;
    let desirabiliteAvant = 0;
    for (let i = 0; i < heures; i++) {
      const r = flux(courant, novembre, { debut: i, fin: i + 1, parMois: heures }, cumul);
      cumul = { ...r.cumul, pasTraites: i + 1 };
      courant = r.entreprise;
      if (i === HEURE_OUVERTURE - 2) {
        // Jusqu'à l'ouverture : aucune vente en boutique.
        expect(venduEnBoutique(cumul)).toBe(0);
        desirabiliteAvant = courant.marque.desirabilite;
      }
    }
    const max = PARAMS["vendeur_ventes_max_pieces_par_mois"]!.valeur;
    expect(venduEnBoutique(cumul)).toBe(Math.floor((max * (heures - HEURE_OUVERTURE)) / heures));
    expect(courant.marque.desirabilite).not.toBe(desirabiliteAvant);
  });

  it("le mois de l'ouverture : loyer depuis la signature, amortissement dès ce mois", () => {
    const r = ecrituresClotureBoutique(pdvNovembre(), novembre);
    const g = gl(r.ecritures);
    // T4 : signée le 10 novembre, loyer de 21 jours sur 30 (765 € × 21/30 = 535,50 €).
    expect(soldeCompte(g, "613")).toBe(53_550);
    expect(soldeCompte(g, "28135")).toBe(18_750);
    expect(enEquilibre(g)).toBe(true);
  });
});
