import { chargerParametresV1, type Parametres } from "@kapital/content";
import { describe, expect, it } from "vitest";
import {
  enregistrer,
  enEquilibre,
  planComptableV1,
  type GrandLivre,
} from "../comptabilite/index.js";
import type { Entreprise } from "../types/entreprise.js";
import {
  centimes,
  idEntreprise,
  idPret,
  idProduit,
  idSalarie,
  moisJeu,
} from "../types/primitifs.js";
import { enregistrerVenteRevendeur } from "../ventes/index.js";
import {
  besoinEnFondsDeRoulement,
  calculerIndicateurs,
  coutRevientDepuisStocks,
  endettement,
  ErreurIndicateurs,
  margeParCanal,
  parametresIndicateursDepuis,
  pointMort,
  previsionnelTresorerie,
  ventesMensuellesDepuisCumul,
} from "./index.js";
import { cumulDemarrantAuPas, cumulVide } from "../moteur/donneesMois.js";

// Les valeurs de ces tests sont calculées à la main. Les paramètres qui entrent
// dans les calculs sont fixés ici pour que les montants attendus ne bougent pas
// quand on recalibre le fichier de paramètres.
function fixer(cle: string, valeur: number): Parametres {
  return { [cle]: { valeur, unite: "test", source: "test", date: "2026-11-24" } };
}
const PARAMS: Parametres = {
  ...chargerParametresV1(),
  ...fixer("tva_standard", 0.2),
  ...fixer("taux_retour_vente_en_ligne", 0.1),
  ...fixer("cout_traitement_retour", 1000),
  ...fixer("smic_mensuel_brut", 180_000),
  ...fixer("taux_cotisations_au_smic", 0.1),
  ...fixer("indicateurs_horizon_previsionnel_mois", 3),
  ...fixer("indicateurs_delai_encaissement_revendeur_mois", 2),
};
const P = parametresIndicateursDepuis(PARAMS);

const TSHIRT = idProduit("prod_tshirt");

function entreprise(o: Partial<Entreprise> = {}): Entreprise {
  return {
    id: idEntreprise("ent_test"),
    nom: "Test",
    gamme: "milieu",
    etape: 2,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(1_000_000),
    stocksMatiere: [],
    stocksFinis: [{ produit: TSHIRT, quantite: 50, valeurTotale: centimes(100_000) }],
    salaries: [
      {
        id: idSalarie("s1"),
        poste: "artisan",
        salaireBrutMensuel: centimes(180_000),
        ancienneteMois: 0,
        experienceMois: 0,
      },
    ],
    atelier: { surfaceM2: 50, loyerMensuel: centimes(50_000), nombreMachines: 2 },
    marque: { notoriete: 0, desirabilite: 0 },
    prets: [
      {
        id: idPret("p1"),
        capitalInitial: centimes(1_200_000),
        capitalRestant: centimes(600_000),
        tauxAnnuel: 0,
        dureeTotaleMois: 12,
        moisDebut: moisJeu(0),
      },
    ],
    // 60 € TTC en direct (50 € HT), 36 € "TTC" côté revendeur (30 € HT)
    catalogue: [
      {
        produit: TSHIRT,
        qualiteVisee: 60,
        prix: { vente_directe: centimes(6000), revendeur: centimes(3600) },
        productionMensuelleCible: 100,
      },
    ],
    ...o,
  };
}

// 10 pièces en direct, 20 chez les revendeurs, par mois
const VENTES = { "prod_tshirt|vente_directe": 10, "prod_tshirt|revendeur": 20 };
const COUTS = { prod_tshirt: centimes(2000) };

/** Grand livre : 512 = 1 000 000, 101 = 500 000, 164 = 600 000, stock fini 60 000,
 *  matières 30 000 à crédit (401), une vente revendeur de 20 pièces (créance 60 000). */
function grandLivre(piecesRevendeur = 20, banque = 1_000_000): GrandLivre {
  let gl = planComptableV1();
  gl = enregistrer(gl, {
    id: "apport",
    mois: moisJeu(0),
    libelle: "Apport et emprunt",
    lignes: [
      { compte: "512", sens: "debit", montant: centimes(banque) },
      { compte: "101", sens: "credit", montant: centimes(banque - 600_000) },
      { compte: "164", sens: "credit", montant: centimes(600_000) },
    ],
  });
  gl = enregistrer(gl, {
    id: "stock_fini",
    mois: moisJeu(0),
    libelle: "Stock fini",
    lignes: [
      { compte: "35", sens: "debit", montant: centimes(100_000) },
      { compte: "101", sens: "credit", montant: centimes(100_000) },
    ],
  });
  gl = enregistrer(gl, {
    id: "achat_matiere",
    mois: moisJeu(1),
    libelle: "Matières à crédit",
    lignes: [
      { compte: "31", sens: "debit", montant: centimes(30_000) },
      { compte: "401", sens: "credit", montant: centimes(30_000) },
    ],
  });
  return enregistrerVenteRevendeur(gl, {
    idEcriture: "vente_rev",
    mois: moisJeu(2),
    produit: TSHIRT,
    quantite: piecesRevendeur,
    prixGrosHtUnitaire: centimes(3000),
    coutRevientUnitaire: centimes(2000),
  });
}

describe("paramètres des indicateurs", () => {
  it("viennent du fichier de paramètres", () => {
    expect(P.horizonMois).toBe(3);
    expect(P.delaiEncaissementRevendeurMois).toBe(2);
    expect(P.tauxTva).toBe(0.2);
  });

  it("refusent un paramètre absent", () => {
    const sans = { ...PARAMS };
    delete sans["indicateurs_horizon_previsionnel_mois"];
    expect(() => parametresIndicateursDepuis(sans)).toThrow(ErreurIndicateurs);
  });

  it("sont tous sourcés et datés dans le fichier", () => {
    const vrais = chargerParametresV1();
    for (const cle of [
      "indicateurs_horizon_previsionnel_mois",
      "indicateurs_delai_encaissement_revendeur_mois",
    ]) {
      expect(vrais[cle]?.source.length).toBeGreaterThan(10);
      expect(vrais[cle]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("coût de revient depuis les stocks", () => {
  it("valeur du stock / quantité, arrondie", () => {
    expect(coutRevientDepuisStocks(entreprise())).toEqual({ prod_tshirt: 2000 });
  });
  it("ignore un produit sans stock", () => {
    expect(coutRevientDepuisStocks(entreprise({ stocksFinis: [] }))).toEqual({});
  });
});

describe("ventes mensuelles de référence", () => {
  it("ramène un mois entamé à un mois complet", () => {
    const cumul = {
      ...cumulVide(moisJeu(3), centimes(0)),
      pasTraites: 6,
      serviParLigne: { "prod_tshirt|revendeur": 5 },
    };
    // 6 pas sur 30 : 5 pièces → 25 sur un mois
    expect(ventesMensuellesDepuisCumul(cumul, 30)).toEqual({ "prod_tshirt|revendeur": 25 });
  });
  it("tient compte du pas de démarrage", () => {
    const cumul = {
      ...cumulDemarrantAuPas(moisJeu(3), centimes(0), 10),
      pasTraites: 15,
      serviParLigne: { "prod_tshirt|vente_directe": 4 },
    };
    // 5 pas vécus sur 30 : 4 pièces → 24
    expect(ventesMensuellesDepuisCumul(cumul, 30)).toEqual({ "prod_tshirt|vente_directe": 24 });
  });
  it("rend rien si aucun pas n'est vécu ou s'il n'y a pas d'état du mois", () => {
    expect(ventesMensuellesDepuisCumul(cumulVide(moisJeu(3), centimes(0)), 30)).toEqual({});
    expect(ventesMensuellesDepuisCumul(null, 30)).toEqual({});
  });
});

describe("marge par canal", () => {
  const r = margeParCanal(entreprise(), VENTES, COUTS, P);

  it("vente directe : (50 € HT - 20 € - 1 € de retours) x 10 = 290 €", () => {
    // retours : 10 % x 10 € = 1 €
    expect(r.parCanal.vente_directe).toEqual({
      pieces: 10,
      chiffreAffairesHt: 50_000,
      margeBrute: 29_000,
    });
  });

  it("revendeur : (30 € - 20 €) x 20 = 200 €", () => {
    expect(r.parCanal.revendeur).toEqual({
      pieces: 20,
      chiffreAffairesHt: 60_000,
      margeBrute: 20_000,
    });
  });

  it("total : 490 € de marge sur 1 100 € de chiffre d'affaires", () => {
    expect(r.total).toEqual({ pieces: 30, chiffreAffairesHt: 110_000, margeBrute: 49_000 });
  });

  it("le taux de marge du revendeur est plus bas que celui de la vente directe", () => {
    expect(r.parCanal.vente_directe.margeBrute / r.parCanal.vente_directe.chiffreAffairesHt).toBeCloseTo(0.58);
    expect(r.parCanal.revendeur.margeBrute / r.parCanal.revendeur.chiffreAffairesHt).toBeCloseTo(1 / 3);
  });

  it("signale un produit sans coût de revient au lieu de l'inventer", () => {
    const sans = margeParCanal(entreprise(), VENTES, {}, P);
    expect(sans.total.pieces).toBe(0);
    expect(sans.produitsIgnores).toEqual(["prod_tshirt"]);
  });

  it("une vente à perte donne une marge négative", () => {
    const cher = margeParCanal(entreprise(), VENTES, { prod_tshirt: centimes(4000) }, P);
    // revendeur : (30 € - 40 €) x 20 = -200 €
    expect(cher.parCanal.revendeur.margeBrute).toBe(-20_000);
  });
});

describe("point mort", () => {
  it("charges fixes 2 480 € (salaire 1 980 € chargé + loyer 500 €) ; 152 pièces, 5 567,35 € de chiffre d affaires (arrondi au centime supérieur)", () => {
    const marges = margeParCanal(entreprise({ prets: [] }), VENTES, COUTS, P);
    const pm = pointMort(entreprise({ prets: [] }), marges.total, moisJeu(3), P);
    expect(pm.chargesFixes).toEqual({ salaires: 198_000, loyer: 50_000, interetsPrets: 0, total: 248_000 });
    // 248 000 x 30 / 49 000 = 151,84 -> 152 pièces
    expect(pm.piecesPointMort).toBe(152);
    // 248 000 x 110 000 / 49 000 = 556 734,69 -> 556 735
    expect(pm.chiffreAffairesPointMortHt).toBe(556_735);
  });

  it("les intérêts du prêt sont une charge fixe : 1 200 000 à 12 % l'an, 1re échéance = 12 000 d'intérêts", () => {
    const e = entreprise({
      prets: [
        {
          id: idPret("p2"),
          capitalInitial: centimes(1_200_000),
          capitalRestant: centimes(1_200_000),
          tauxAnnuel: 0.12,
          dureeTotaleMois: 12,
          moisDebut: moisJeu(2),
        },
      ],
    });
    const marges = margeParCanal(e, VENTES, COUTS, P);
    const pm = pointMort(e, marges.total, moisJeu(3), P);
    expect(pm.chargesFixes.interetsPrets).toBe(12_000);
    expect(pm.chargesFixes.total).toBe(198_000 + 50_000 + 12_000);
  });

  it("sans ventes ou sans marge positive, le point mort n'existe pas", () => {
    const e = entreprise();
    const vide = margeParCanal(e, {}, COUTS, P);
    expect(pointMort(e, vide.total, moisJeu(3), P).piecesPointMort).toBeNull();
    const perte = margeParCanal(e, VENTES, { prod_tshirt: centimes(9000) }, P);
    expect(pointMort(e, perte.total, moisJeu(3), P).chiffreAffairesPointMortHt).toBeNull();
  });
});

describe("besoin en fonds de roulement", () => {
  it("stocks 31 + 35 + créances 411 - dettes 401 = 90 000 + 60 000 - 30 000 = 120 000", () => {
    // 35 : 100 000 - 40 000 (vendu) = 60 000 ; 31 : 30 000 ; 411 : 60 000 ; 401 : 30 000
    expect(besoinEnFondsDeRoulement(grandLivre())).toEqual({
      stocks: 90_000,
      creances: 60_000,
      dettesFournisseurs: 30_000,
      besoin: 120_000,
    });
  });

  it("doubler les ventes aux revendeurs augmente le besoin en fonds de roulement", () => {
    const avant = besoinEnFondsDeRoulement(grandLivre(20)).besoin;
    const apres = besoinEnFondsDeRoulement(grandLivre(40)).besoin;
    // créances 120 000, stock fini 20 000 : 30 000 + 20 000 + 120 000 - 30 000 = 140 000
    expect(apres).toBe(140_000);
    expect(apres).toBeGreaterThan(avant);
  });
});

describe("endettement", () => {
  it("dettes 164 = 6 000 €, échéance du mois 1 000 € dont 0 d'intérêts, fonds propres 5 200 €", () => {
    const e = endettement(grandLivre(), entreprise(), moisJeu(3), P);
    expect(e.dettesFinancieres).toBe(600_000);
    expect(e.mensualitesDuMois).toBe(100_000);
    expect(e.interetsDuMois).toBe(0);
    // capitaux propres : 101 (500 000) + résultat (707 60 000 - 7135 40 000 = 20 000)
    expect(e.capitauxPropres).toBe(520_000);
    expect(e.ratioDettesCapitauxPropres).toBeCloseTo(600_000 / 520_000);
  });

  it("pas de ratio quand les fonds propres ne sont pas positifs", () => {
    const gl = enregistrer(planComptableV1(), {
      id: "perte",
      mois: moisJeu(1),
      libelle: "Perte",
      lignes: [
        { compte: "601", sens: "debit", montant: centimes(10_000) },
        { compte: "512", sens: "credit", montant: centimes(10_000) },
      ],
    });
    expect(endettement(gl, entreprise({ prets: [] }), moisJeu(3), P).ratioDettesCapitauxPropres).toBeNull();
  });
});

describe("prévisionnel de trésorerie à 3 mois", () => {
  const e = entreprise();
  const marges = margeParCanal(e, VENTES, COUTS, P);

  it("calculé à la main sur 3 mois", () => {
    const prev = previsionnelTresorerie(grandLivre(), e, marges, moisJeu(3), P);
    expect(prev.tresorerieDepart).toBe(1_000_000);
    expect(prev.mois.map((m) => m.mois)).toEqual([3, 4, 5]);

    // Encaissements directs : 10 x 50 € x (1 - 10 %) = 450 € par mois.
    // Créances existantes (600 €) : la moitié aux mois 3 et 4. Revendeurs du mois 3 : encaissés au mois 5.
    // Décaissements : salaire chargé 1 980 + loyer 500 + échéance de prêt 1 000 = 3 480 €,
    // plus les 300 € dus aux fournisseurs au premier mois.
    const [m0, m1, m2] = prev.mois;
    expect(m0).toMatchObject({
      encaissementsDirects: 45_000,
      encaissementsRevendeurs: 30_000,
      salaires: 198_000,
      loyer: 50_000,
      echeancesPrets: 100_000,
      dettesFournisseurs: 30_000,
      fluxNet: -303_000,
      tresorerieFin: 697_000,
    });
    expect(m1).toMatchObject({
      encaissementsRevendeurs: 30_000,
      dettesFournisseurs: 0,
      fluxNet: -273_000,
      tresorerieFin: 424_000,
    });
    expect(m2).toMatchObject({
      encaissementsRevendeurs: 60_000,
      fluxNet: -243_000,
      tresorerieFin: 181_000,
    });
    expect(prev.premierMoisDecouvert).toBeNull();
  });

  it("annonce le premier mois de découvert prévu", () => {
    const prev = previsionnelTresorerie(grandLivre(20, 800_000), e, marges, moisJeu(3), P);
    // 800 000 - 303 000 = 497 000 ; - 273 000 = 224 000 ; - 243 000 = -19 000
    expect(prev.mois.map((m) => m.tresorerieFin)).toEqual([497_000, 224_000, -19_000]);
    expect(prev.premierMoisDecouvert).toBe(5);
  });

  it("l'horizon vient du paramètre", () => {
    const court = parametresIndicateursDepuis({
      ...PARAMS,
      ...fixer("indicateurs_horizon_previsionnel_mois", 1),
    });
    expect(previsionnelTresorerie(grandLivre(), e, marges, moisJeu(3), court).mois).toHaveLength(1);
  });
});

describe("calculerIndicateurs", () => {
  it("assemble les cinq indicateurs sans toucher au grand livre", () => {
    const gl = grandLivre();
    const avant = JSON.stringify(gl);
    const r = calculerIndicateurs({
      entreprise: entreprise(),
      grandLivre: gl,
      ventesMensuelles: VENTES,
      moisCourant: moisJeu(3),
      params: PARAMS,
    });
    expect(r.marges.total.margeBrute).toBe(49_000);
    expect(r.pointMort.chargesFixes.total).toBe(248_000 + 0);
    expect(r.besoinEnFondsDeRoulement.besoin).toBe(120_000);
    expect(r.previsionnel.mois).toHaveLength(3);
    expect(r.endettement.dettesFinancieres).toBe(600_000);
    expect(JSON.stringify(gl)).toBe(avant);
    expect(enEquilibre(gl)).toBe(true);
  });

  it("n'utilise que des centimes entiers", () => {
    const r = calculerIndicateurs({
      entreprise: entreprise(),
      grandLivre: grandLivre(),
      ventesMensuelles: { "prod_tshirt|vente_directe": 7, "prod_tshirt|revendeur": 13 },
      moisCourant: moisJeu(3),
      params: PARAMS,
    });
    for (const m of r.previsionnel.mois) {
      for (const v of [m.encaissementsDirects, m.encaissementsRevendeurs, m.fluxNet, m.tresorerieFin]) {
        expect(Number.isInteger(v)).toBe(true);
      }
    }
    expect(Number.isInteger(r.marges.total.margeBrute)).toBe(true);
  });

  it("doubler les ventes aux revendeurs augmente le besoin en fonds de roulement du grand livre", () => {
    const base = calculerIndicateurs({
      entreprise: entreprise(),
      grandLivre: grandLivre(20),
      ventesMensuelles: VENTES,
      moisCourant: moisJeu(3),
      params: PARAMS,
    });
    const double = calculerIndicateurs({
      entreprise: entreprise(),
      grandLivre: grandLivre(40),
      ventesMensuelles: { ...VENTES, "prod_tshirt|revendeur": 40 },
      moisCourant: moisJeu(3),
      params: PARAMS,
    });
    expect(double.besoinEnFondsDeRoulement.besoin).toBeGreaterThan(base.besoinEnFondsDeRoulement.besoin);
  });
});
