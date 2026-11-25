import {
  centimes,
  idEntreprise,
  idMatiere,
  idProduit,
  minutes,
  ACTIONS_VERROUILLABLES,
  type Decision,
  type Entreprise,
  type Produit,
} from "@kapital/engine";
import { describe, expect, it } from "vitest";
import { validerDecision } from "./validerDecision.js";
import type { ContexteValidation, Result } from "./types.js";
import {
  CODE_ETAPE_VERROUILLEE,
  refusDepuisVerrou,
  verifierDeblocage,
  verifierDeblocageEtape,
} from "./validations/verrouEtape.js";

const PROD = idProduit("prod_tshirt");
const MAT = idMatiere("mat_jersey");

function entreprise(overrides: Partial<Entreprise> = {}): Entreprise {
  return {
    id: idEntreprise("ent_verrou"),
    nom: "Test",
    gamme: "milieu",
    etape: 0,
    proprietaire: { type: "joueur", idProfil: "profil_test" },
    statut: "active",
    tresorerie: centimes(2_000_000),
    stocksMatiere: [{ matiere: MAT, quantite: 100, valeurTotale: centimes(50_000) }],
    stocksFinis: [],
    salaries: [],
    atelier: { surfaceM2: 50, loyerMensuel: centimes(100_000), nombreMachines: 2 },
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

const produit: Produit = {
  id: PROD,
  type: "t_shirt",
  nom: "T-shirt",
  matiere: MAT,
  consommationParPiece: 0.8,
  fournituresParPiece: centimes(60),
  tempsStandard: minutes(25),
};

function ctx(e: Entreprise): ContexteValidation {
  return { entreprise: e, produits: [produit] };
}

function refus(r: Result) {
  expect(r.ok).toBe(false);
  if (r.ok) throw new Error("refus attendu");
  return r;
}

const MARKETING: Decision = { type: "action_marketing", action: "publicite", montant: centimes(10_000) };
const PRET: Decision = { type: "demande_pret", objet: "equipement", montant: centimes(100_000), dureeMois: 24 };
const PRODUCTION: Decision = { type: "ordre_production", produit: PROD, quantite: 10, lieu: { type: "atelier" } };
const REVENDEUR: Decision = { type: "changer_prix", produit: PROD, canal: "revendeur", prix: centimes(3000) };
const EMBAUCHE: Decision = { type: "embauche", poste: "artisan", salaireBrutMensuel: centimes(186_702) };

describe("refus d'étape : structure et condition manquante chiffrée", () => {
  it("marketing à l'étape 0 : étape 1 requise, il manque 12 pièces sur 50", () => {
    const e = entreprise({ cumulsEtape: { piecesVendues: 38, chiffreAffairesHt: centimes(0) } });
    const r = refus(validerDecision(ctx(e), MARKETING));
    expect(r.code).toBe(CODE_ETAPE_VERROUILLEE);
    expect(r.etapeRequise).toBe(1);
    expect(r.conditions).toEqual([
      { cle: "pieces_vendues", unite: "pieces", actuel: 38, requis: 50, manque: 12 },
    ]);
    expect(r.message).toContain("étape 1");
    expect(r.message).toContain("12 pièces vendues");
  });

  it("prêt à l'étape 1 : étape 2 requise, chiffre d'affaires et trésorerie chiffrés", () => {
    const e = entreprise({
      etape: 1,
      tresorerie: centimes(-2_000),
      cumulsEtape: { piecesVendues: 80, chiffreAffairesHt: centimes(1_250_000) },
    });
    const r = refus(validerDecision(ctx(e), PRET));
    expect(r.code).toBe(CODE_ETAPE_VERROUILLEE);
    expect(r.etapeRequise).toBe(2);
    expect(r.conditions).toEqual([
      { cle: "chiffre_affaires_ht_cumule", unite: "centimes", actuel: 1_250_000, requis: 3_000_000, manque: 1_750_000 },
      { cle: "tresorerie_positive", unite: "centimes", actuel: -2_000, requis: 1, manque: 2_001 },
    ]);
    expect(r.message).toContain("étape 2");
    expect(r.message).toContain("17500,00 €");
    expect(r.message).toContain("trésorerie");
  });

  it("production à l'atelier verrouillée à l'étape 0, mais pas chez un façonnier", () => {
    const r = refus(validerDecision(ctx(entreprise()), PRODUCTION));
    expect(r.code).toBe(CODE_ETAPE_VERROUILLEE);
    expect(r.etapeRequise).toBeDefined();
    expect(r.conditions?.length).toBeGreaterThan(0);
    const facon: Decision = { ...PRODUCTION, lieu: { type: "faconnier", faconnier: "fac_pt" } } as Decision;
    const r2 = validerDecision(ctx(entreprise()), facon);
    if (!r2.ok) expect(r2.code).not.toBe(CODE_ETAPE_VERROUILLEE);
  });

  it("vente aux revendeurs verrouillée à l'étape 1 ; la vente directe ne l'est pas", () => {
    const e = entreprise({ etape: 1, cumulsEtape: { piecesVendues: 90, chiffreAffairesHt: centimes(2_000_000) } });
    const r = refus(validerDecision(ctx(e), REVENDEUR));
    expect(r.code).toBe(CODE_ETAPE_VERROUILLEE);
    expect(r.etapeRequise).toBe(2);
    expect(r.conditions?.[0]).toMatchObject({ cle: "chiffre_affaires_ht_cumule", requis: 3_000_000, manque: 1_000_000 });
    const direct: Decision = { ...REVENDEUR, canal: "vente_directe" } as Decision;
    expect(validerDecision(ctx(entreprise()), direct).ok).toBe(true);
  });

  it("embauche à l'étape 1 : étape 2 requise", () => {
    const r = refus(validerDecision(ctx(entreprise({ etape: 1 })), EMBAUCHE));
    expect(r.code).toBe(CODE_ETAPE_VERROUILLEE);
    expect(r.etapeRequise).toBe(2);
    expect(r.conditions?.length).toBeGreaterThan(0);
  });

  it("à l'étape 2, aucune de ces actions n'est refusée pour cause d'étape", () => {
    const e = entreprise({ etape: 2 });
    for (const d of [MARKETING, PRET, PRODUCTION, REVENDEUR, EMBAUCHE]) {
      const r = validerDecision(ctx(e), d);
      if (!r.ok) expect(r.code).not.toBe(CODE_ETAPE_VERROUILLEE);
    }
  });
});

describe("verifierDeblocage et verifierDeblocageEtape (aussi utilisée par les routes d'API)", () => {
  it("verifierDeblocage lit l'étape, les cumuls et la trésorerie de l'entreprise", () => {
    const e = entreprise({ cumulsEtape: { piecesVendues: 10, chiffreAffairesHt: centimes(0) } });
    const r = refus(verifierDeblocage(ctx(e), "action_marketing"));
    expect(r.conditions?.[0]).toMatchObject({ cle: "pieces_vendues", actuel: 10, manque: 40 });
    expect(verifierDeblocage(ctx(entreprise({ etape: 1 })), "action_marketing").ok).toBe(true);
  });

  it("louer_atelier : refusé à l'étape 1 avec condition chiffrée, permis à l'étape 2", () => {
    const etat = { etape: 1 as const, tresorerie: 500_000, cumuls: { piecesVendues: 90, chiffreAffairesHt: centimes(2_000_000) } };
    const r = refus(verifierDeblocageEtape("louer_atelier", etat));
    expect(r.code).toBe(CODE_ETAPE_VERROUILLEE);
    expect(r.etapeRequise).toBe(2);
    expect(r.conditions).toEqual([
      { cle: "chiffre_affaires_ht_cumule", unite: "centimes", actuel: 2_000_000, requis: 3_000_000, manque: 1_000_000 },
    ]);
    expect(verifierDeblocageEtape("louer_atelier", { ...etat, etape: 2 }).ok).toBe(true);
  });

  it("sans cumuls fournis, compteurs à zéro", () => {
    const r = refus(verifierDeblocageEtape("action_marketing", { etape: 0, tresorerie: 0 }));
    expect(r.conditions?.[0]).toMatchObject({ cle: "pieces_vendues", actuel: 0, manque: 50 });
  });

  it("chaque action verrouillable est refusée à l'étape 0 avec une étape requise et un message", () => {
    for (const a of ACTIONS_VERROUILLABLES) {
      const r = verifierDeblocageEtape(a, { etape: 0, tresorerie: 100 });
      if (!r.ok) {
        expect(r.code).toBe(CODE_ETAPE_VERROUILLEE);
        expect(r.etapeRequise).toBeGreaterThan(0);
        expect(r.message).toMatch(/étape/);
      }
    }
  });

  it("refusDepuisVerrou reprend les champs du verrou", () => {
    const r = refusDepuisVerrou({
      action: "demande_pret",
      etapeRequise: 2,
      etapeActuelle: 1,
      conditions: [],
    });
    expect(r).toMatchObject({ ok: false, code: CODE_ETAPE_VERROUILLEE, etapeRequise: 2, conditions: [] });
    expect(r.message).toBe("L'emprunt se débloque à l'étape 2 (vous êtes à l'étape 1).");
  });
});
