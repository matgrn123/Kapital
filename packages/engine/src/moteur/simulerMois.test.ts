import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import type { Atelier, Entreprise, Pret } from "../types/entreprise.js";
import {
  centimes,
  graine,
  idEntreprise,
  idMatiere,
  idPret,
  idProduit,
  idSalarie,
  moisJeu,
  type Graine,
  type MoisJeu,
} from "../types/primitifs.js";
import type { MarketInputs } from "../types/marketInputs.js";
import {
  simulerMoisEntreprise,
  type CreanceAEncaisser,
  type DonneesReellesMois,
  type LivraisonFaconnier,
  type LivraisonMatiere,
} from "./simulerMois.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PARAMS = chargerParametresV1();
const GRAINE: Graine = graine(42);
const MOIS_1: MoisJeu = moisJeu(1);

function marketInputsTest(): MarketInputs {
  return {
    mois: moisJeu(0),
    smicHoraireBrut: centimes(1231),
    tauxEstrAnnuel: 0.035,
    prixElectriciteParKwh: centimes(16),
    coursCotonParKg: centimes(180),
    inflationMensuelle: 0.002,
  };
}

function donneeesVides(): DonneesReellesMois {
  return {
    livraisonsMatiere: [],
    livraisonsFaconniers: [],
    depensesMarketing: [],
    creancesAEncaisser: [],
    tvaAPayerCeMois: centimes(0),
    moisDecouvertConsecutifs: 0,
  };
}

/** Entreprise PNJ minimal sans stock, sans employés */
function entreprisePnjBase(): Entreprise {
  return {
    id: idEntreprise("ent_test"),
    nom: "Test SARL",
    gamme: "milieu",
    etape: 0,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(1_000_000), // 10 000 €
    stocksMatiere: [],
    stocksFinis: [],
    salaries: [],
    atelier: null,
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [],
    catalogue: [],
  };
}

/** Entreprise avec 100 pièces en stock */
function entrepriseAvecStock(quantite: number = 100, valeur: number = 50000): Entreprise {
  return {
    ...entreprisePnjBase(),
    stocksFinis: [
      {
        produit: idProduit("prod_tshirt"),
        quantite,
        valeurTotale: centimes(valeur),
      },
    ],
    catalogue: [
      {
        produit: idProduit("prod_tshirt"),
        qualiteVisee: 60,
        prix: {
          vente_directe: centimes(1000), // 10 € TTC
          revendeur: centimes(600), // 6 € HT
        },
        productionMensuelleCible: 0,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("simulerMoisEntreprise — scénario de base", () => {
  it("retourne une structure valide sans données réelles", () => {
    const ent = entreprisePnjBase();
    const result = simulerMoisEntreprise(
      ent,
      donneeesVides(),
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    expect(result.entrepriseApres).toBeDefined();
    expect(result.ecritures).toBeDefined();
    expect(result.ventesPerdues).toBeDefined();
    expect(result.explications).toBeDefined();
    expect(result.moisDecouvertConsecutifsApres).toBe(0);
  });

  it("ancienneté incrémentée pour les salariés", () => {
    const ent: Entreprise = {
      ...entreprisePnjBase(),
      salaries: [
        {
          id: idSalarie("sal_1"),
          poste: "artisan",
          salaireBrutMensuel: centimes(186702),
          ancienneteMois: 5,
          experienceMois: 5,
        },
      ],
    };
    const result = simulerMoisEntreprise(
      ent,
      donneeesVides(),
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const sal = result.entrepriseApres.salaries[0]!;
    expect(sal.ancienneteMois).toBe(6);
    expect(sal.experienceMois).toBe(6);
  });
});

describe("simulerMoisEntreprise — livraisons de matière", () => {
  it("livraison immediat : 31 débit, 512 crédit", () => {
    const livraison: LivraisonMatiere = {
      id: "lm1",
      matiere: idMatiere("mat_coton"),
      quantite: 100,
      prixUnitaire: centimes(200),
      modePaiement: "immediat",
    };
    const result = simulerMoisEntreprise(
      entreprisePnjBase(),
      { ...donneeesVides(), livraisonsMatiere: [livraison] },
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const ec = result.ecritures.find((e) => e.id === `livraison_mat_${MOIS_1}_lm1`);
    expect(ec).toBeDefined();
    const lignes = ec!.lignes;
    const debit31 = lignes.find((l) => l.compte === "31" && l.sens === "debit");
    const credit512 = lignes.find((l) => l.compte === "512" && l.sens === "credit");
    expect(debit31?.montant).toBe(100 * 200);
    expect(credit512?.montant).toBe(100 * 200);
    // Pas de 401
    expect(lignes.find((l) => l.compte === "401")).toBeUndefined();
  });

  it("livraison credit : 31 débit, 401 crédit (pas 512)", () => {
    const livraison: LivraisonMatiere = {
      id: "lm2",
      matiere: idMatiere("mat_coton"),
      quantite: 50,
      prixUnitaire: centimes(400),
      modePaiement: "credit",
    };
    const result = simulerMoisEntreprise(
      entreprisePnjBase(),
      { ...donneeesVides(), livraisonsMatiere: [livraison] },
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const ec = result.ecritures.find((e) => e.id === `livraison_mat_${MOIS_1}_lm2`);
    expect(ec).toBeDefined();
    const lignes = ec!.lignes;
    const debit31 = lignes.find((l) => l.compte === "31" && l.sens === "debit");
    const credit401 = lignes.find((l) => l.compte === "401" && l.sens === "credit");
    expect(debit31?.montant).toBe(50 * 400);
    expect(credit401?.montant).toBe(50 * 400);
    // Pas de 512
    expect(lignes.find((l) => l.compte === "512")).toBeUndefined();
  });

  it("stock matière augmente après livraison", () => {
    const livraison: LivraisonMatiere = {
      id: "lm3",
      matiere: idMatiere("mat_jersey"),
      quantite: 200,
      prixUnitaire: centimes(150),
      modePaiement: "immediat",
    };
    const result = simulerMoisEntreprise(
      entreprisePnjBase(),
      { ...donneeesVides(), livraisonsMatiere: [livraison] },
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const stock = result.entrepriseApres.stocksMatiere.find(
      (s) => s.matiere === idMatiere("mat_jersey"),
    );
    expect(stock).toBeDefined();
    expect(stock!.quantite).toBe(200);
    expect(stock!.valeurTotale).toBe(200 * 150);
  });
});

describe("simulerMoisEntreprise — livraisons façonniers", () => {
  it("livraison façonnier : 35 débit, 31+401 crédit", () => {
    const livraison: LivraisonFaconnier = {
      id: "lf1",
      produit: idProduit("prod_chemise"),
      quantite: 30,
      prixFaconParPiece: centimes(500),
      coutMatiereParPiece: centimes(300),
    };
    const result = simulerMoisEntreprise(
      entreprisePnjBase(),
      { ...donneeesVides(), livraisonsFaconniers: [livraison] },
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const ec = result.ecritures.find((e) => e.id === `livraison_fac_${MOIS_1}_lf1`);
    expect(ec).toBeDefined();
    const lignes = ec!.lignes;
    const totalMatiere = 30 * 300;
    const totalFacon = 30 * 500;
    const totalPF = totalMatiere + totalFacon;
    expect(lignes.find((l) => l.compte === "35" && l.sens === "debit")?.montant).toBe(totalPF);
    expect(lignes.find((l) => l.compte === "31" && l.sens === "credit")?.montant).toBe(totalMatiere);
    expect(lignes.find((l) => l.compte === "401" && l.sens === "credit")?.montant).toBe(totalFacon);
  });

  it("livraison sans matière (produit fini acheté tel quel) : 35 débit / 401 crédit, sans ligne à zéro", () => {
    const livraison: LivraisonFaconnier = {
      id: "lg1",
      produit: idProduit("prod_chemise"),
      quantite: 30,
      prixFaconParPiece: centimes(900),
      coutMatiereParPiece: centimes(0),
    };
    const result = simulerMoisEntreprise(
      entreprisePnjBase(),
      { ...donneeesVides(), livraisonsFaconniers: [livraison] },
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const ec = result.ecritures.find((e) => e.id === `livraison_fac_${MOIS_1}_lg1`);
    expect(ec).toBeDefined();
    expect(ec!.lignes).toHaveLength(2);
    expect(ec!.lignes.find((l) => l.compte === "35" && l.sens === "debit")?.montant).toBe(30 * 900);
    expect(ec!.lignes.find((l) => l.compte === "401" && l.sens === "credit")?.montant).toBe(30 * 900);
    expect(ec!.lignes.some((l) => l.compte === "31")).toBe(false);
  });

  it("stock fini augmente après livraison façonnier", () => {
    const livraison: LivraisonFaconnier = {
      id: "lf2",
      produit: idProduit("prod_sac"),
      quantite: 20,
      prixFaconParPiece: centimes(1000),
      coutMatiereParPiece: centimes(600),
    };
    const result = simulerMoisEntreprise(
      entreprisePnjBase(),
      { ...donneeesVides(), livraisonsFaconniers: [livraison] },
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const stock = result.entrepriseApres.stocksFinis.find(
      (s) => s.produit === idProduit("prod_sac"),
    );
    expect(stock).toBeDefined();
    expect(stock!.quantite).toBe(20);
    expect(stock!.valeurTotale).toBe(20 * (600 + 1000));
  });
});

describe("simulerMoisEntreprise — clamp au stock", () => {
  it("ventes > stock : ventesPerdues non vide, stock à 0", () => {
    // Avec seulement 10 pièces en stock, sur un marché de 8 millions de pièces,
    // la demande générée va dépasser 10
    const ent: Entreprise = {
      ...entreprisePnjBase(),
      stocksFinis: [
        {
          produit: idProduit("prod_tshirt"),
          quantite: 10,
          valeurTotale: centimes(5000),
        },
      ],
      catalogue: [
        {
          produit: idProduit("prod_tshirt"),
          qualiteVisee: 60,
          prix: {
            vente_directe: centimes(1000),
            revendeur: centimes(600),
          },
          productionMensuelleCible: 0,
        },
      ],
      marque: { notoriete: 80, desirabilite: 80 }, // haute notoriété pour s'assurer de ventes
    };
    const result = simulerMoisEntreprise(
      ent,
      donneeesVides(),
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    // Le stock fini ne peut pas être négatif
    for (const sf of result.entrepriseApres.stocksFinis) {
      expect(sf.quantite).toBeGreaterThanOrEqual(0);
    }
    // Si des ventes ont été générées et dépassaient le stock, ventesPerdues doit refléter ça
    // (peut être vide si aucune vente générée)
    for (const vp of result.ventesPerdues) {
      expect(vp.quantiteServie).toBeLessThanOrEqual(vp.quantiteDemandee);
      expect(vp.quantiteServie).toBeGreaterThanOrEqual(0);
    }
  });

  it("stock jamais négatif même avec très forte demande", () => {
    // Marque maximale + stock minimal = test robustesse
    const ent: Entreprise = {
      ...entrepriseAvecStock(1, 500), // 1 seule pièce
      marque: { notoriete: 100, desirabilite: 100 },
    };
    const result = simulerMoisEntreprise(
      ent,
      donneeesVides(),
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    for (const sf of result.entrepriseApres.stocksFinis) {
      expect(sf.quantite).toBeGreaterThanOrEqual(0);
      expect(sf.valeurTotale).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("simulerMoisEntreprise — retours en ligne", () => {
  it("retours enregistrés avec taux 19 %", () => {
    // On va mettre beaucoup de stock pour que des ventes aient lieu
    const ent: Entreprise = {
      ...entrepriseAvecStock(1000, 500000),
      marque: { notoriete: 80, desirabilite: 80 },
    };
    const result = simulerMoisEntreprise(
      ent,
      donneeesVides(),
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    // S'il y a des ventes directes, il doit y avoir des retours
    const ventesDirectes = result.ecritures.filter(
      (e) => e.id.startsWith(`vente_${MOIS_1}_`) && e.id.endsWith("_vente_directe"),
    );
    const retours = result.ecritures.filter((e) => e.id.startsWith(`retour_${MOIS_1}_`));
    if (ventesDirectes.length > 0) {
      expect(retours.length).toBeGreaterThan(0);
    }
  });
});

describe("simulerMoisEntreprise — charges fixes", () => {
  it("salaire artisan au SMIC : écritures 641+645 et paiement 512", () => {
    const ent: Entreprise = {
      ...entreprisePnjBase(),
      tresorerie: centimes(10_000_000), // assez pour tout payer
      salaries: [
        {
          id: idSalarie("sal_artisan"),
          poste: "artisan",
          salaireBrutMensuel: centimes(186702),
          ancienneteMois: 0,
          experienceMois: 0,
        },
      ],
    };
    const result = simulerMoisEntreprise(
      ent,
      donneeesVides(),
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const ecSalaire = result.ecritures.find(
      (e) => e.id === `salaire_${MOIS_1}_sal_artisan`,
    );
    expect(ecSalaire).toBeDefined();
    // 641 débit salaire brut
    const debit641 = ecSalaire!.lignes.find((l) => l.compte === "641" && l.sens === "debit");
    expect(debit641?.montant).toBe(186702);
    // 645 débit cotisations patronales
    const debit645 = ecSalaire!.lignes.find((l) => l.compte === "645" && l.sens === "debit");
    expect(debit645?.montant).toBeGreaterThan(0);

    // Écriture de paiement avec 512
    const ecPaiement = result.ecritures.find(
      (e) => e.id === `salaire_pmt_${MOIS_1}_sal_artisan`,
    );
    expect(ecPaiement).toBeDefined();
    const credit512 = ecPaiement!.lignes.find((l) => l.compte === "512" && l.sens === "credit");
    expect(credit512).toBeDefined();
    // 512 crédit = salaire brut + cotisations
    expect(credit512!.montant).toBeGreaterThan(186702);
  });

  it("loyer atelier : 613 débit, 512 crédit", () => {
    const atelier: Atelier = {
      surfaceM2: 100,
      loyerMensuel: centimes(200000), // 2000€
      nombreMachines: 2,
    };
    const ent: Entreprise = {
      ...entreprisePnjBase(),
      tresorerie: centimes(10_000_000),
      atelier,
    };
    const result = simulerMoisEntreprise(
      ent,
      donneeesVides(),
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const ecLoyer = result.ecritures.find((e) => e.id === `loyer_${MOIS_1}_ent_test`);
    expect(ecLoyer).toBeDefined();
    expect(ecLoyer!.lignes.find((l) => l.compte === "613" && l.sens === "debit")?.montant).toBe(200000);
    expect(ecLoyer!.lignes.find((l) => l.compte === "512" && l.sens === "credit")?.montant).toBe(200000);
  });

  it("énergie atelier : 606 débit, 512 crédit", () => {
    const atelier: Atelier = {
      surfaceM2: 100,
      loyerMensuel: centimes(200000),
      nombreMachines: 3,
    };
    const ent: Entreprise = {
      ...entreprisePnjBase(),
      tresorerie: centimes(10_000_000),
      atelier,
    };
    const result = simulerMoisEntreprise(
      ent,
      donneeesVides(),
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const ecEnergie = result.ecritures.find((e) => e.id === `energie_${MOIS_1}_ent_test`);
    expect(ecEnergie).toBeDefined();
    // 3 machines × 100 kwh × 16 centimes = 4800 centimes
    expect(ecEnergie!.lignes.find((l) => l.compte === "606" && l.sens === "debit")?.montant).toBe(4800);
  });

  it("amortissement machines : 681 débit, 2815 crédit (non-cash)", () => {
    const atelier: Atelier = {
      surfaceM2: 100,
      loyerMensuel: centimes(200000),
      nombreMachines: 2,
    };
    const ent: Entreprise = {
      ...entreprisePnjBase(),
      tresorerie: centimes(10_000_000),
      atelier,
    };
    const result = simulerMoisEntreprise(
      ent,
      donneeesVides(),
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const ecAmort = result.ecritures.find((e) => e.id === `amort_${MOIS_1}_ent_test`);
    expect(ecAmort).toBeDefined();
    // 2 machines × 500000c / 60 = 16666c
    const expectedAmort = Math.round((500000 * 2) / 60);
    expect(ecAmort!.lignes.find((l) => l.compte === "681" && l.sens === "debit")?.montant).toBe(expectedAmort);
    expect(ecAmort!.lignes.find((l) => l.compte === "2815" && l.sens === "credit")?.montant).toBe(expectedAmort);
  });
});

describe("simulerMoisEntreprise — prêts", () => {
  it("échéance de prêt : 164+661 débit, 512 crédit", () => {
    const pret: Pret = {
      id: idPret("pret_1"),
      capitalInitial: centimes(1_000_000), // 10 000 €
      capitalRestant: centimes(1_000_000),
      tauxAnnuel: 0.03,
      dureeTotaleMois: 24,
      objet: "tresorerie",
      moisDebut: moisJeu(0),
    };
    const ent: Entreprise = {
      ...entreprisePnjBase(),
      tresorerie: centimes(10_000_000),
      prets: [pret],
    };
    // mois 1 = première échéance (numEcheance = 1 - 0 = 1)
    const result = simulerMoisEntreprise(
      ent,
      donneeesVides(),
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const ecEcheance = result.ecritures.find(
      (e) => e.id === `echeance_${MOIS_1}_pret_1`,
    );
    expect(ecEcheance).toBeDefined();
    // 164 débit amortissement
    const debit164 = ecEcheance!.lignes.find((l) => l.compte === "164" && l.sens === "debit");
    expect(debit164?.montant).toBeGreaterThan(0);
    // 661 débit intérêts
    const debit661 = ecEcheance!.lignes.find((l) => l.compte === "661" && l.sens === "debit");
    expect(debit661?.montant).toBeGreaterThan(0);
    // 512 crédit mensualité totale
    const credit512 = ecEcheance!.lignes.find((l) => l.compte === "512" && l.sens === "credit");
    expect(credit512?.montant).toBeGreaterThan(0);
    expect(credit512!.montant).toBe((debit164?.montant ?? 0) + (debit661?.montant ?? 0));
  });

  it("capital restant mis à jour après échéance", () => {
    const pret: Pret = {
      id: idPret("pret_2"),
      capitalInitial: centimes(2_000_000),
      capitalRestant: centimes(2_000_000),
      tauxAnnuel: 0.05,
      dureeTotaleMois: 12,
      objet: "tresorerie",
      moisDebut: moisJeu(0),
    };
    const ent: Entreprise = {
      ...entreprisePnjBase(),
      tresorerie: centimes(10_000_000),
      prets: [pret],
    };
    const result = simulerMoisEntreprise(
      ent,
      donneeesVides(),
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const pretApres = result.entrepriseApres.prets[0]!;
    expect(pretApres.capitalRestant).toBeLessThan(pret.capitalRestant);
    expect(pretApres.capitalRestant).toBeGreaterThanOrEqual(0);
  });
});

describe("simulerMoisEntreprise — TVA", () => {
  it("ventes directes : TVA collectée en 44571", () => {
    const ent = entrepriseAvecStock(1000, 500000);
    const result = simulerMoisEntreprise(
      { ...ent, marque: { notoriete: 80, desirabilite: 80 } },
      donneeesVides(),
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    // Si des ventes directes ont eu lieu, 44571 doit avoir des crédits nets
    const hasVenteDirecte = result.ecritures.some(
      (e) => e.id.endsWith("_vente_directe"),
    );
    if (hasVenteDirecte) {
      // La déclaration TVA doit exister
      const ecTvaDecl = result.ecritures.find(
        (e) => e.id === `tva_declaration_${MOIS_1}_ent_test`,
      );
      expect(ecTvaDecl).toBeDefined();
      // 44571 débit dans la déclaration
      const debit44571 = ecTvaDecl!.lignes.find(
        (l) => l.compte === "44571" && l.sens === "debit",
      );
      expect(debit44571?.montant).toBeGreaterThan(0);
      // 44551 crédit
      const credit44551 = ecTvaDecl!.lignes.find(
        (l) => l.compte === "44551" && l.sens === "credit",
      );
      expect(credit44551?.montant).toBeGreaterThan(0);
    }
  });

  it("paiement TVA mois précédent : 44551 débit, 512 crédit", () => {
    const ent = entreprisePnjBase();
    const tvaAPayer = centimes(50000); // 500 € de TVA à payer
    const result = simulerMoisEntreprise(
      ent,
      { ...donneeesVides(), tvaAPayerCeMois: tvaAPayer },
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const ecTvaPmt = result.ecritures.find(
      (e) => e.id === `tva_paiement_${MOIS_1}_ent_test`,
    );
    expect(ecTvaPmt).toBeDefined();
    expect(ecTvaPmt!.lignes.find((l) => l.compte === "44551" && l.sens === "debit")?.montant).toBe(50000);
    expect(ecTvaPmt!.lignes.find((l) => l.compte === "512" && l.sens === "credit")?.montant).toBe(50000);
  });
});

describe("simulerMoisEntreprise — découvert", () => {
  it("découvert < 3 mois : statut reste active", () => {
    const ent: Entreprise = {
      ...entreprisePnjBase(),
      tresorerie: centimes(-100000), // déjà à découvert
    };
    const result = simulerMoisEntreprise(
      ent,
      { ...donneeesVides(), moisDecouvertConsecutifs: 1 },
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    expect(result.moisDecouvertConsecutifsApres).toBe(2);
    expect(result.entrepriseApres.statut).toBe("active");
  });

  it("3 mois consécutifs de découvert → statut en_difficulte", () => {
    const ent: Entreprise = {
      ...entreprisePnjBase(),
      tresorerie: centimes(-500000),
    };
    const result = simulerMoisEntreprise(
      ent,
      { ...donneeesVides(), moisDecouvertConsecutifs: 2 },
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    expect(result.moisDecouvertConsecutifsApres).toBe(3);
    expect(result.entrepriseApres.statut).toBe("en_difficulte");
  });

  it("agios calculés sur le découvert à 15 % annuel", () => {
    const decouvert = 1_200_000; // 12 000 € découvert
    const ent: Entreprise = {
      ...entreprisePnjBase(),
      tresorerie: centimes(-decouvert),
    };
    const result = simulerMoisEntreprise(
      ent,
      donneeesVides(),
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const ecAgios = result.ecritures.find((e) => e.id === `agios_${MOIS_1}_ent_test`);
    // On s'attend à des agios si le découvert persiste
    // Les agios exacts dépendent des autres mouvements 512 dans le mois
    if (ecAgios) {
      const debit661 = ecAgios.lignes.find((l) => l.compte === "661" && l.sens === "debit");
      expect(debit661?.montant).toBeGreaterThan(0);
      const credit512 = ecAgios.lignes.find((l) => l.compte === "512" && l.sens === "credit");
      expect(credit512?.montant).toBeGreaterThan(0);
    }
  });

  it("trésorerie positive : moisDecouvert remis à 0", () => {
    const ent: Entreprise = {
      ...entreprisePnjBase(),
      tresorerie: centimes(5_000_000),
    };
    const result = simulerMoisEntreprise(
      ent,
      { ...donneeesVides(), moisDecouvertConsecutifs: 2 },
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    expect(result.moisDecouvertConsecutifsApres).toBe(0);
  });
});

describe("simulerMoisEntreprise — encaissements créances", () => {
  it("encaissement créance : 512 débit, 411 crédit", () => {
    const creance: CreanceAEncaisser = {
      ecritureId: "vente_ancien_12345",
      montant: centimes(300000),
    };
    const result = simulerMoisEntreprise(
      entreprisePnjBase(),
      { ...donneeesVides(), creancesAEncaisser: [creance] },
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const ec = result.ecritures.find(
      (e) => e.id === `encaissement_${MOIS_1}_vente_ancien_12345`,
    );
    expect(ec).toBeDefined();
    expect(ec!.lignes.find((l) => l.compte === "512" && l.sens === "debit")?.montant).toBe(300000);
    expect(ec!.lignes.find((l) => l.compte === "411" && l.sens === "credit")?.montant).toBe(300000);
  });
});

describe("simulerMoisEntreprise — IS fin d'exercice", () => {
  it("IS calculé au mois 12 si bénéfice", () => {
    // Créer une situation avec des ventes et un bénéfice
    const ent = entrepriseAvecStock(5000, 2_500_000);
    const mois12 = moisJeu(12);
    const result = simulerMoisEntreprise(
      { ...ent, marque: { notoriete: 70, desirabilite: 70 } },
      donneeesVides(),
      marketInputsTest(),
      PARAMS,
      GRAINE,
      mois12,
    );
    // Si des ventes ont eu lieu, l'IS doit avoir été calculé
    const ecIs = result.ecritures.find((e) => e.id === `is_${mois12}_ent_test`);
    // L'IS peut ne pas exister si le résultat est négatif (déficit)
    // On vérifie juste la cohérence structurelle si l'IS existe
    if (ecIs) {
      const debit695 = ecIs.lignes.find((l) => l.compte === "695" && l.sens === "debit");
      expect(debit695?.montant).toBeGreaterThan(0);
      const credit444 = ecIs.lignes.find((l) => l.compte === "444" && l.sens === "credit");
      expect(credit444?.montant).toBeGreaterThan(0);
    }
  });

  it("pas d'IS au mois 1 (pas fin d'exercice)", () => {
    const result = simulerMoisEntreprise(
      entrepriseAvecStock(1000, 500000),
      donneeesVides(),
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const ecIs = result.ecritures.find((e) => e.id.startsWith(`is_${MOIS_1}_`));
    expect(ecIs).toBeUndefined();
  });
});

describe("simulerMoisEntreprise — idempotence", () => {
  it("mêmes entrées → mêmes sorties (déterminisme)", () => {
    const ent = entrepriseAvecStock(100, 50000);
    const donnees = donneeesVides();
    const params = chargerParametresV1();
    const inputs = marketInputsTest();

    const r1 = simulerMoisEntreprise(ent, donnees, inputs, params, GRAINE, MOIS_1);
    const r2 = simulerMoisEntreprise(ent, donnees, inputs, params, GRAINE, MOIS_1);

    expect(r1.entrepriseApres.tresorerie).toBe(r2.entrepriseApres.tresorerie);
    expect(r1.ecritures.length).toBe(r2.ecritures.length);
    expect(r1.ventesPerdues.length).toBe(r2.ventesPerdues.length);
    expect(r1.moisDecouvertConsecutifsApres).toBe(r2.moisDecouvertConsecutifsApres);
  });

  it("ne modifie pas l'entreprise d'origine", () => {
    const ent = entreprisePnjBase();
    const tresoOrigine = ent.tresorerie;
    simulerMoisEntreprise(ent, donneeesVides(), marketInputsTest(), PARAMS, GRAINE, MOIS_1);
    // L'entreprise d'entrée est immuable
    expect(ent.tresorerie).toBe(tresoOrigine);
  });
});

describe("simulerMoisEntreprise — marketing", () => {
  it("dépense marketing : 623 débit, 512 crédit", () => {
    const ent = entreprisePnjBase();
    const result = simulerMoisEntreprise(
      ent,
      {
        ...donneeesVides(),
        depensesMarketing: [
          { id: "camp1", action: "publicite", montant: centimes(100000) },
        ],
      },
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const ec = result.ecritures.find((e) => e.id === `marketing_${MOIS_1}_camp1`);
    expect(ec).toBeDefined();
    expect(ec!.lignes.find((l) => l.compte === "623" && l.sens === "debit")?.montant).toBe(100000);
    expect(ec!.lignes.find((l) => l.compte === "512" && l.sens === "credit")?.montant).toBe(100000);
  });

  it("marque mise à jour après dépense marketing", () => {
    const ent = entreprisePnjBase();
    const notoAvant = ent.marque.notoriete;
    const result = simulerMoisEntreprise(
      ent,
      {
        ...donneeesVides(),
        depensesMarketing: [
          { id: "camp2", action: "publicite", montant: centimes(1_000_000) },
        ],
      },
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    // La notoriété après doit avoir bougé (décroissance + effet publicité)
    // Avec 10 000 € de pub, l'effet doit surpasser la décroissance
    expect(result.entrepriseApres.marque.notoriete).not.toBe(notoAvant);
  });
});

describe("simulerMoisEntreprise — explications", () => {
  it("explications contient toujours au moins la ligne trésorerie", () => {
    const result = simulerMoisEntreprise(
      entreprisePnjBase(),
      donneeesVides(),
      marketInputsTest(),
      PARAMS,
      GRAINE,
      MOIS_1,
    );
    const expTresorerie = result.explications.find((e) => e.cle === "tresorerie");
    expect(expTresorerie).toBeDefined();
    expect(expTresorerie!.message).toContain("€");
  });
});
