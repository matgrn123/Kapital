import { chargerParametresV1, type Parametres } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { enEquilibre, enregistrer, planComptableV1, soldeCompte } from "../comptabilite/index.js";
import type { EcritureComptable } from "../comptabilite/types.js";
import type { Entreprise, FicheFabrication } from "../types/entreprise.js";
import {
  centimes,
  idEntreprise,
  idMatiere,
  idProduit,
  idSalarie,
  moisJeu,
} from "../types/primitifs.js";
import { cumulVide, type DonneesFlux } from "./donneesMois.js";
import {
  besoinMatiere,
  montantFactureFaconnier,
  montantLivraisonMatiere,
  parametreObligatoire,
  piecesPermisesParLaMatiere,
} from "./fabrication.js";
import { avancerFlux, planProductionDuMois } from "./flux.js";

const PARAMS = chargerParametresV1();
const CHUTE = PARAMS["taux_chute_matiere_defaut"]!.valeur;
const MOIS = moisJeu(3);
const JERSEY = idMatiere("mat_jersey_coton");
const POPELINE = idMatiere("mat_popeline");
const TSHIRT = idProduit("prod_tshirt");

const FICHE_TSHIRT: FicheFabrication = {
  matiere: JERSEY,
  consommationParPiece: 0.8,
  fournituresParPiece: centimes(60),
  tempsStandardMinutes: 25,
};

function entreprise(surcharge: Partial<Entreprise> = {}): Entreprise {
  return {
    id: idEntreprise("ent_f"),
    nom: "Fabrique",
    gamme: "milieu",
    etape: 1,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(1_000_000),
    stocksMatiere: [
      // La popeline est en premier : l'atelier doit pourtant prendre le jersey.
      { matiere: POPELINE, quantite: 100, valeurTotale: centimes(90_000) },
      { matiere: JERSEY, quantite: 500, valeurTotale: centimes(250_000) },
    ],
    stocksFinis: [],
    salaries: [1, 2].map((i) => ({
      id: idSalarie(`s${i}`),
      poste: "artisan" as const,
      salaireBrutMensuel: centimes(186_702),
      ancienneteMois: 12,
      experienceMois: 12,
    })),
    atelier: { surfaceM2: 80, loyerMensuel: centimes(150_000), nombreMachines: 2 },
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [],
    catalogue: [
      {
        produit: TSHIRT,
        qualiteVisee: 60,
        prix: { vente_directe: centimes(3000), revendeur: centimes(1800) },
        productionMensuelleCible: 100,
        fabrication: FICHE_TSHIRT,
      },
    ],
    ...surcharge,
  };
}

const FLUX_VIDE: DonneesFlux = {
  livraisonsMatiere: [],
  livraisonsFaconniers: [],
  depensesMarketing: [],
  creancesAEncaisser: [],
};

function unMois(ent: Entreprise, flux: DonneesFlux = FLUX_VIDE, params: Parametres = PARAMS) {
  return avancerFlux(ent, cumulVide(MOIS, ent.tresorerie), flux, {
    params,
    mois: MOIS,
    pasDebut: 0,
    pasFin: 1,
    pasParMois: 1,
    suffixeId: "",
  });
}

/** Grand livre ouvert avec les stocks et la banque de l'entreprise (contrepartie : capital). */
function grandLivreOuvert(ent: Entreprise, ecritures: readonly EcritureComptable[]) {
  const valeur31 = ent.stocksMatiere.reduce((t, s) => t + s.valeurTotale, 0);
  let gl = enregistrer(planComptableV1(), {
    id: "ouverture",
    mois: MOIS,
    libelle: "Ouverture",
    lignes: [
      { compte: "512", sens: "debit", montant: ent.tresorerie },
      { compte: "31", sens: "debit", montant: centimes(valeur31) },
      { compte: "101", sens: "credit", montant: centimes(ent.tresorerie + valeur31) },
    ],
  });
  const actifEgalPassif: boolean[] = [];
  for (const e of ecritures) {
    gl = enregistrer(gl, e);
    actifEgalPassif.push(enEquilibre(gl));
  }
  return { gl, actifEgalPassif };
}

describe("fabrication : fonctions pures", () => {
  it("besoin de matière = pièces × consommation × (1 + chute)", () => {
    expect(besoinMatiere(100, FICHE_TSHIRT, 0.15)).toBeCloseTo(92, 9);
    expect(piecesPermisesParLaMatiere(92, FICHE_TSHIRT, 0.15)).toBe(100);
    expect(piecesPermisesParLaMatiere(91.9, FICHE_TSHIRT, 0.15)).toBe(99);
  });

  it("facture du façonnier = (façon + fournitures) × pièces ; grossiste = façon seule", () => {
    expect(montantFactureFaconnier(10, centimes(450), FICHE_TSHIRT)).toBe(5100);
    expect(montantFactureFaconnier(10, centimes(450), null)).toBe(4500);
    expect(montantLivraisonMatiere(12.5, centimes(420))).toBe(5250);
  });

  it("paramètre absent : erreur explicite, pas de valeur cachée", () => {
    expect(() => parametreObligatoire({}, "taux_chute_matiere_defaut")).toThrow(/taux_chute_matiere_defaut/);
  });
});

describe("production atelier : bonne matière, nomenclature, temps standard", () => {
  it("le temps standard du produit fixe la capacité (pas 30 minutes en dur)", () => {
    const ent = entreprise({
      catalogue: [{ ...entreprise().catalogue[0]!, productionMensuelleCible: 100_000 }],
    });
    const plan = planProductionDuMois(ent, PARAMS);
    const autre = planProductionDuMois(
      { ...ent, catalogue: [{ ...ent.catalogue[0]!, fabrication: { ...FICHE_TSHIRT, tempsStandardMinutes: 50 } }] },
      PARAMS,
    );
    expect(plan[0]!.pieces).toBeGreaterThan(0);
    // Deux fois plus long par pièce : environ deux fois moins de pièces.
    expect(Math.abs(plan[0]!.pieces - 2 * autre[0]!.pieces)).toBeLessThanOrEqual(1);
  });

  it("consomme la matière du produit (chute comprise) et les fournitures ; 35 = 31 + 512", () => {
    const ent = entreprise();
    const r = unMois(ent);
    const ec = r.ecritures.find((e) => e.id.startsWith("production_atelier_"))!;
    expect(ec).toBeDefined();
    const besoin = 100 * 0.8 * (1 + CHUTE);
    const valeurMatiere = Math.round(besoin * 500); // coût moyen du jersey : 5 € l'unité
    const ligne = (compte: string) => ec.lignes.find((l) => l.compte === compte)?.montant;
    expect(ligne("31")).toBe(valeurMatiere);
    expect(ligne("512")).toBe(100 * 60);
    expect(ligne("35")).toBe(valeurMatiere + 6000);
    const jersey = r.entreprise.stocksMatiere.find((s) => s.matiere === JERSEY)!;
    expect(jersey.quantite).toBeCloseTo(500 - besoin, 6);
    expect(r.entreprise.stocksMatiere.find((s) => s.matiere === POPELINE)!.quantite).toBe(100);
    const { actifEgalPassif } = grandLivreOuvert(ent, r.ecritures);
    expect(actifEgalPassif.every(Boolean)).toBe(true);
  });

  it("sans la bonne matière : aucune pièce produite, jamais de pièce à coût nul", () => {
    const ent = entreprise({
      stocksMatiere: [{ matiere: POPELINE, quantite: 100, valeurTotale: centimes(90_000) }],
    });
    const r = unMois(ent);
    expect(r.ecritures.some((e) => e.id.startsWith("production_atelier_"))).toBe(false);
    expect(r.entreprise.stocksFinis.find((s) => s.produit === TSHIRT)?.quantite ?? 0).toBe(0);
  });

  it("matière insuffisante : on produit ce que la matière permet", () => {
    const ent = entreprise({
      stocksMatiere: [{ matiere: JERSEY, quantite: 46, valeurTotale: centimes(23_000) }],
    });
    const r = unMois(ent);
    expect(r.cumul.produitParProduit[TSHIRT]).toBe(50);
  });

  it("produit sans nomenclature : erreur explicite", () => {
    const { fabrication: _f, ...sansFiche } = entreprise().catalogue[0]!;
    expect(() => planProductionDuMois(entreprise({ catalogue: [sansFiche] }), PARAMS)).toThrow(/nomenclature/);
  });
});

describe("règlement des fournisseurs et façonniers à l'échéance", () => {
  it("401 débit / 512 crédit, une écriture par commande, trésorerie diminuée", () => {
    const ent = entreprise({ catalogue: [], atelier: null, salaries: [] });
    const r = unMois(ent, {
      ...FLUX_VIDE,
      dettesEchues: [
        { ordreId: "po1", nature: "matiere", montant: centimes(42_000) },
        { ordreId: "pr1", nature: "faconnier", montant: centimes(51_000) },
      ],
    });
    const mat = r.ecritures.find((e) => e.id === "reglement_matiere_po1")!;
    const fac = r.ecritures.find((e) => e.id === "reglement_faconnier_pr1")!;
    expect(mat.lignes).toEqual([
      { compte: "401", sens: "debit", montant: 42_000 },
      { compte: "512", sens: "credit", montant: 42_000 },
    ]);
    expect(fac.lignes[0]).toEqual({ compte: "401", sens: "debit", montant: 51_000 });
    expect(r.entreprise.tresorerie).toBe(1_000_000 - 93_000);
  });

  it("trésorerie insuffisante : la dette est payée quand même (découvert facturé à la clôture)", () => {
    const ent = entreprise({ catalogue: [], atelier: null, salaries: [], tresorerie: centimes(10_000) });
    const r = unMois(ent, {
      ...FLUX_VIDE,
      dettesEchues: [{ ordreId: "po2", nature: "matiere", montant: centimes(30_000) }],
    });
    expect(r.entreprise.tresorerie).toBe(-20_000);
  });

  it("livraison puis règlement : 401 revient à zéro et actif = passif après chaque écriture", () => {
    const ent = entreprise({ catalogue: [], atelier: null, salaries: [] });
    const livraison = unMois(ent, {
      ...FLUX_VIDE,
      livraisonsMatiere: [
        { id: "po3", matiere: JERSEY, quantite: 100, prixUnitaire: centimes(420), modePaiement: "credit" },
      ],
      livraisonsFaconniers: [
        { id: "pr3", produit: TSHIRT, quantite: 50, prixFaconParPiece: centimes(450), matiereDuJoueur: FICHE_TSHIRT },
      ],
    });
    const reglement = unMois(livraison.entreprise, {
      ...FLUX_VIDE,
      dettesEchues: [
        { ordreId: "po3", nature: "matiere", montant: montantLivraisonMatiere(100, centimes(420)) },
        { ordreId: "pr3", nature: "faconnier", montant: montantFactureFaconnier(50, centimes(450), FICHE_TSHIRT) },
      ],
    });
    const toutes = [...livraison.ecritures, ...reglement.ecritures];
    const { gl, actifEgalPassif } = grandLivreOuvert(ent, toutes);
    expect(actifEgalPassif.every(Boolean)).toBe(true);
    expect(soldeCompte(gl, "401")).toBe(0);
  });
});
