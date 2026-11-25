import { chargerParametresV1, type Parametres } from "@kapital/content";
import { describe, expect, it } from "vitest";
import {
  enregistrerDeblocagePret,
  enregistrerEcheance,
  genererEcheancier,
} from "./calculs.js";
import {
  OBJETS_PRET,
  capaciteEmprunt,
  evaluerDemandePret,
  reglesPretDepuis,
  tauxPret,
  ErreurPrets,
  type ReglesPret,
} from "./capacite.js";
import {
  enEquilibre,
  planComptableV1,
  resultat,
  soldeCompte,
} from "../comptabilite/index.js";
import { centimes, moisJeu } from "../types/primitifs.js";

const PARAMS = chargerParametresV1();
const REGLES: ReglesPret = reglesPretDepuis(PARAMS);

function sans(cle: string): Parametres {
  const copie = { ...PARAMS };
  delete copie[cle];
  return copie;
}

describe("paramètres des prêts (AE-4)", () => {
  it("chaque règle vient d'un paramètre sourcé, pour les trois objets", () => {
    for (const objet of OBJETS_PRET) {
      const r = REGLES.parObjet[objet];
      expect(r.margeSurEstr).toBeGreaterThan(0);
      expect(r.dureeMinMois).toBeGreaterThan(0);
      expect(r.dureeMaxMois).toBeGreaterThanOrEqual(r.dureeMinMois);
      expect(r.plafondMontant).toBeGreaterThan(0);
      expect(r.plafondEndettementMultipleTresorerie).toBeGreaterThan(0);
    }
    expect(REGLES.estrDeSecoursAnnuel).toBeGreaterThanOrEqual(0);
  });

  it("chaque paramètre de prêt a une source et une date", () => {
    const cles = Object.keys(PARAMS).filter((c) => c.startsWith("pret_"));
    expect(cles.length).toBeGreaterThanOrEqual(13);
    for (const c of cles) {
      expect(PARAMS[c]!.source.length).toBeGreaterThan(10);
      expect(PARAMS[c]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("un paramètre manquant est signalé par son nom", () => {
    expect(() => reglesPretDepuis(sans("pret_marge_estr_immobilier"))).toThrow(ErreurPrets);
    expect(() => reglesPretDepuis(sans("pret_marge_estr_immobilier"))).toThrow(
      /pret_marge_estr_immobilier/,
    );
  });

  it("des bornes de durée incohérentes sont refusées", () => {
    const p = {
      ...PARAMS,
      pret_duree_min_mois_equipement: { ...PARAMS["pret_duree_min_mois_equipement"]!, valeur: 120 },
    };
    expect(() => reglesPretDepuis(p)).toThrow(ErreurPrets);
  });
});

describe("tauxPret : €STR du mois + marge selon l'objet", () => {
  it("additionne l'€STR et la marge de l'objet", () => {
    const marge = REGLES.parObjet.equipement.margeSurEstr;
    expect(tauxPret("equipement", 0.03, REGLES)).toBeCloseTo(0.03 + marge, 10);
  });

  it("un €STR négatif ne fait pas baisser le taux sous la marge", () => {
    expect(tauxPret("immobilier", -0.005, REGLES)).toBeCloseTo(
      REGLES.parObjet.immobilier.margeSurEstr,
      10,
    );
  });

  it("l'immobilier (garanti) coûte moins cher que la trésorerie", () => {
    expect(tauxPret("immobilier", 0.03, REGLES)).toBeLessThan(tauxPret("tresorerie", 0.03, REGLES));
  });
});

const sit = (tresorerie: number, detteEnCours = 0) => ({
  tresorerie: centimes(tresorerie),
  detteEnCours: centimes(detteEnCours),
});

describe("capaciteEmprunt", () => {
  it("le montant maximal est le plus petit du plafond par prêt et de la marge d'endettement", () => {
    // trésorerie 5 000 € : marge d'endettement tréso = multiple × 500 000 − dette
    const r = REGLES.parObjet.tresorerie;
    const cap = capaciteEmprunt(sit(500_000, 0), "tresorerie", REGLES);
    expect(cap.plafondEndettement).toBe(r.plafondEndettementMultipleTresorerie * 500_000);
    expect(cap.montantMaximal).toBe(Math.min(r.plafondMontant, cap.plafondEndettement));
  });

  it("la dette déjà contractée réduit la marge, sans jamais être négative", () => {
    const cap = capaciteEmprunt(sit(100_000, 99_999_999), "equipement", REGLES);
    expect(cap.margeEndettement).toBe(0);
    expect(cap.montantMaximal).toBe(0);
  });

  it("une trésorerie négative ou nulle compte pour 1 centime (plafond quasi nul)", () => {
    const cap = capaciteEmprunt(sit(-5_000, 0), "equipement", REGLES);
    expect(cap.plafondEndettement).toBe(REGLES.parObjet.equipement.plafondEndettementMultipleTresorerie);
  });
});

describe("evaluerDemandePret : refus chiffrés", () => {
  const bonne = { objet: "equipement" as const, montant: centimes(1_000_000), dureeMois: 60 };

  it("accepte une demande dans les plafonds", () => {
    expect(evaluerDemandePret(sit(2_000_000), bonne, REGLES)).toEqual({ ok: true });
  });

  it("refuse un montant nul", () => {
    const r = evaluerDemandePret(sit(2_000_000), { ...bonne, montant: centimes(0) }, REGLES);
    expect(r).toMatchObject({ ok: false, code: "montant_invalide" });
  });

  it("refuse une durée hors bornes de l'objet, avec les bornes dans le message", () => {
    const { dureeMaxMois } = REGLES.parObjet.tresorerie;
    const r = evaluerDemandePret(
      sit(2_000_000),
      { objet: "tresorerie", montant: centimes(100_000), dureeMois: dureeMaxMois + 1 },
      REGLES,
    );
    expect(r).toMatchObject({ ok: false, code: "duree_hors_bornes" });
    if (!r.ok) expect(r.message).toContain(String(dureeMaxMois));
  });

  it("la même durée peut être permise pour l'immobilier et refusée pour la trésorerie", () => {
    const duree = REGLES.parObjet.immobilier.dureeMinMois;
    expect(duree).toBeGreaterThan(REGLES.parObjet.tresorerie.dureeMaxMois);
    expect(duree).toBeLessThanOrEqual(REGLES.parObjet.immobilier.dureeMaxMois);
    expect(duree).toBeGreaterThanOrEqual(REGLES.parObjet.immobilier.dureeMinMois);
    const t = evaluerDemandePret(sit(50_000_000), { objet: "tresorerie", montant: centimes(100_000), dureeMois: duree }, REGLES);
    const i = evaluerDemandePret(sit(50_000_000), { objet: "immobilier", montant: centimes(100_000), dureeMois: duree }, REGLES);
    expect(t.ok).toBe(false);
    expect(i.ok).toBe(true);
  });

  it("refuse hors du plafond d'endettement : plafond, demande et manque chiffrés", () => {
    const m = REGLES.parObjet.equipement.plafondEndettementMultipleTresorerie;
    const tresorerie = 100_000;
    const plafond = m * tresorerie;
    const demande = plafond + 12_345;
    const r = evaluerDemandePret(sit(tresorerie), { ...bonne, montant: centimes(demande) }, REGLES);
    expect(r).toMatchObject({ ok: false, code: "endettement_excessif" });
    if (!r.ok) {
      expect(r.depassement).toEqual({ plafond, demande, manque: 12_345 });
      expect(r.message).toMatch(/dette/i);
    }
  });

  it("l'endettement tient compte des prêts déjà en cours", () => {
    const m = REGLES.parObjet.equipement.plafondEndettementMultipleTresorerie;
    const tresorerie = 100_000;
    const plafond = m * tresorerie;
    const r = evaluerDemandePret(sit(tresorerie, plafond - 1_000), { ...bonne, montant: centimes(1_001) }, REGLES);
    expect(r).toMatchObject({ ok: false, code: "endettement_excessif" });
    if (!r.ok) expect(r.depassement).toEqual({ plafond, demande: plafond + 1, manque: 1 });
  });

  it("refuse au-dessus du plafond par prêt de l'objet, même avec beaucoup de trésorerie", () => {
    const { plafondMontant } = REGLES.parObjet.tresorerie;
    const r = evaluerDemandePret(
      sit(900_000_000),
      { objet: "tresorerie", montant: centimes(plafondMontant + 1), dureeMois: 24 },
      REGLES,
    );
    expect(r).toMatchObject({ ok: false, code: "plafond_pret_depasse" });
    if (!r.ok) expect(r.depassement).toEqual({ plafond: plafondMontant, demande: plafondMontant + 1, manque: 1 });
  });

  it("pile au plafond : accepté", () => {
    const { plafondMontant } = REGLES.parObjet.tresorerie;
    const r = evaluerDemandePret(
      sit(900_000_000),
      { objet: "tresorerie", montant: centimes(plafondMontant), dureeMois: 24 },
      REGLES,
    );
    expect(r.ok).toBe(true);
  });
});

describe("comptabilité d'un prêt : intérêts en charge (661), capital hors résultat (164)", () => {
  it("le déblocage ne touche pas le résultat ; l'échéance met seulement les intérêts en charge", () => {
    const capital = centimes(1_200_000);
    const taux = tauxPret("equipement", 0.03, REGLES);
    const ech = genererEcheancier(capital, taux, 36);
    let gl = enregistrerDeblocagePret(planComptableV1(), {
      idEcriture: "pret_1",
      mois: moisJeu(1),
      capital,
    });
    expect(soldeCompte(gl, "164")).toBe(capital);
    expect(resultat(gl)).toBe(0);
    gl = enregistrerEcheance(gl, { idEcriture: "ech_1", mois: moisJeu(2), echeance: ech[0]! });
    expect(soldeCompte(gl, "661")).toBe(ech[0]!.interets);
    expect(resultat(gl)).toBe(-ech[0]!.interets);
    expect(soldeCompte(gl, "164")).toBe(capital - ech[0]!.amortissement);
    expect(enEquilibre(gl)).toBe(true);
  });
});
