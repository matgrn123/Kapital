import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { centimes } from "../types/primitifs.js";
import {
  ACTIONS_VERROUILLABLES,
  conditionsManquantes,
  constaterEtape,
  etapeRequisePour,
  ErreurEtapes,
  seuilsEtapesDepuis,
  verrouPour,
  type EtatPourEtape,
} from "./index.js";

const PARAMS = chargerParametresV1();
const SEUILS = seuilsEtapesDepuis(PARAMS);

function etat(o: Partial<EtatPourEtape> = {}): EtatPourEtape {
  return {
    etape: 0,
    cumuls: { piecesVendues: 0, chiffreAffairesHt: centimes(0) },
    tresorerie: centimes(2_000_000),
    ...o,
  };
}

describe("seuils des étapes", () => {
  it("viennent des paramètres : 50 pièces, 30 000 € de chiffre d'affaires hors taxes", () => {
    expect(SEUILS.piecesEtape1).toBe(50);
    expect(SEUILS.chiffreAffairesHtEtape2).toBe(centimes(3_000_000));
  });

  it("refuse un paramètre absent ou invalide", () => {
    expect(() => seuilsEtapesDepuis({})).toThrow(ErreurEtapes);
    const faux = {
      ...PARAMS,
      seuil_etape_1_pieces_vendues: { ...PARAMS["seuil_etape_1_pieces_vendues"]!, valeur: 0 },
    };
    expect(() => seuilsEtapesDepuis(faux)).toThrow(ErreurEtapes);
  });
});

describe("constat de l'étape", () => {
  it("reste à 0 sous 50 pièces", () => {
    expect(constaterEtape(etat({ cumuls: { piecesVendues: 49, chiffreAffairesHt: centimes(100_000) } }), SEUILS)).toBe(0);
  });

  it("passe à 1 à 50 pièces vendues au total", () => {
    expect(constaterEtape(etat({ cumuls: { piecesVendues: 50, chiffreAffairesHt: centimes(100_000) } }), SEUILS)).toBe(1);
  });

  it("passe à 2 à 30 000 € de chiffre d'affaires cumulé HT avec une trésorerie positive", () => {
    const cumuls = { piecesVendues: 600, chiffreAffairesHt: centimes(3_000_000) };
    expect(constaterEtape(etat({ etape: 1, cumuls, tresorerie: centimes(1) }), SEUILS)).toBe(2);
  });

  it("reste à 1 si le chiffre d'affaires suffit mais la trésorerie est nulle ou négative", () => {
    const cumuls = { piecesVendues: 600, chiffreAffairesHt: centimes(3_500_000) };
    expect(constaterEtape(etat({ etape: 1, cumuls, tresorerie: centimes(0) }), SEUILS)).toBe(1);
    expect(constaterEtape(etat({ etape: 1, cumuls, tresorerie: centimes(-5_000) }), SEUILS)).toBe(1);
  });

  it("reste à 1 sous 30 000 € même avec beaucoup de trésorerie", () => {
    const cumuls = { piecesVendues: 600, chiffreAffairesHt: centimes(2_999_999) };
    expect(constaterEtape(etat({ etape: 1, cumuls, tresorerie: centimes(9_000_000) }), SEUILS)).toBe(1);
  });

  it("ne redescend jamais, même si la trésorerie devient négative", () => {
    expect(constaterEtape(etat({ etape: 2, tresorerie: centimes(-1_000_000) }), SEUILS)).toBe(2);
    expect(constaterEtape(etat({ etape: 1 }), SEUILS)).toBe(1);
  });
});

describe("conditions manquantes", () => {
  it("étape 1 : chiffre le nombre de pièces qui manquent", () => {
    const c = conditionsManquantes(1, etat({ cumuls: { piecesVendues: 38, chiffreAffairesHt: centimes(0) } }), SEUILS);
    expect(c).toEqual([
      { cle: "pieces_vendues", unite: "pieces", actuel: 38, requis: 50, manque: 12 },
    ]);
  });

  it("étape 2 : chiffre d'affaires manquant et trésorerie à rétablir", () => {
    const c = conditionsManquantes(
      2,
      etat({
        etape: 1,
        cumuls: { piecesVendues: 80, chiffreAffairesHt: centimes(1_250_000) },
        tresorerie: centimes(-2_000),
      }),
      SEUILS,
    );
    expect(c).toEqual([
      { cle: "chiffre_affaires_ht_cumule", unite: "centimes", actuel: 1_250_000, requis: 3_000_000, manque: 1_750_000 },
      { cle: "tresorerie_positive", unite: "centimes", actuel: -2_000, requis: 1, manque: 2_001 },
    ]);
  });

  it("aucune condition manquante quand le seuil est atteint", () => {
    expect(conditionsManquantes(0, etat(), SEUILS)).toEqual([]);
    expect(conditionsManquantes(1, etat({ cumuls: { piecesVendues: 50, chiffreAffairesHt: centimes(0) } }), SEUILS)).toEqual([]);
  });
});

describe("déblocages par étape", () => {
  it("chaque action verrouillable a une étape requise", () => {
    for (const a of ACTIONS_VERROUILLABLES) {
      expect([0, 1, 2]).toContain(etapeRequisePour(a));
    }
  });

  it("table du plan : marketing dès l'étape 1 ; prêt, local, embauche, revendeurs à l'étape 2", () => {
    expect(etapeRequisePour("action_marketing")).toBe(1);
    expect(etapeRequisePour("demande_pret")).toBe(2);
    expect(etapeRequisePour("louer_atelier")).toBe(2);
    expect(etapeRequisePour("embauche")).toBe(2);
    expect(etapeRequisePour("vente_revendeur")).toBe(2);
  });

  it("action verrouillée : refus avec la condition manquante chiffrée", () => {
    const v = verrouPour(
      "action_marketing",
      etat({ cumuls: { piecesVendues: 38, chiffreAffairesHt: centimes(0) } }),
      SEUILS,
    );
    expect(v).not.toBeNull();
    expect(v!.etapeRequise).toBe(1);
    expect(v!.etapeActuelle).toBe(0);
    expect(v!.conditions[0]).toMatchObject({ cle: "pieces_vendues", manque: 12 });
  });

  it("action débloquée : aucun verrou", () => {
    expect(verrouPour("action_marketing", etat({ etape: 1 }), SEUILS)).toBeNull();
    expect(verrouPour("embauche", etat({ etape: 2 }), SEUILS)).toBeNull();
  });
});
