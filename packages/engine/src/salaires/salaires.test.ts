import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import {
  enEquilibre,
  planComptableV1,
  soldeCompte,
} from "../comptabilite/index.js";
import { centimes, moisJeu } from "../types/primitifs.js";
import {
  coefficientsSalairesDepuisParametres,
  cotisationsPatronales,
  coutEmployeur,
  enregistrerPaieMensuelle,
  tauxCotisations,
} from "./calculs.js";

function entrees(brut: number) {
  const c = coefficientsSalairesDepuisParametres(chargerParametresV1());
  return {
    salaireBrutMensuel: centimes(brut),
    smicMensuelBrut: c.smicMensuelBrut,
    tauxCotisationsSmic: c.tauxCotisationsSmic,
    tauxCotisationsPleines: c.tauxCotisationsPleines,
    seuilCotisationsPleinesEnSmic: c.seuilCotisationsPleinesEnSmic,
  };
}

describe("tauxCotisations", () => {
  it("au SMIC exactement : taux réduit", () => {
    const c = coefficientsSalairesDepuisParametres(chargerParametresV1());
    const t = tauxCotisations(entrees(c.smicMensuelBrut));
    expect(t).toBe(c.tauxCotisationsSmic);
  });

  it("au-delà de 1,6 SMIC : taux plein (environ 40 %)", () => {
    const c = coefficientsSalairesDepuisParametres(chargerParametresV1());
    const brut = Math.round(c.smicMensuelBrut * 2);
    const t = tauxCotisations(entrees(brut));
    expect(t).toBe(c.tauxCotisationsPleines);
  });

  it("entre SMIC et 1,6 SMIC : interpolation linéaire croissante", () => {
    const c = coefficientsSalairesDepuisParametres(chargerParametresV1());
    const t11 = tauxCotisations(entrees(Math.round(c.smicMensuelBrut * 1.1)));
    const t13 = tauxCotisations(entrees(Math.round(c.smicMensuelBrut * 1.3)));
    const t15 = tauxCotisations(entrees(Math.round(c.smicMensuelBrut * 1.5)));
    expect(t11).toBeGreaterThan(c.tauxCotisationsSmic);
    expect(t13).toBeGreaterThan(t11);
    expect(t15).toBeGreaterThan(t13);
    expect(t15).toBeLessThan(c.tauxCotisationsPleines);
  });
});

describe("critère T11 : coût employeur du SMIC ≈ 1 933 €/mois", () => {
  it("coût mensuel SMIC entre 1 928 et 1 938 € (±5 €)", () => {
    const c = coefficientsSalairesDepuisParametres(chargerParametresV1());
    const cout = coutEmployeur(entrees(c.smicMensuelBrut));
    expect(cout).toBeGreaterThanOrEqual(192_800);
    expect(cout).toBeLessThanOrEqual(193_800);
  });

  it("cotisations SMIC environ 66 € par mois (3,5 % du brut)", () => {
    const c = coefficientsSalairesDepuisParametres(chargerParametresV1());
    const cot = cotisationsPatronales(entrees(c.smicMensuelBrut));
    expect(cot).toBeGreaterThan(6000);
    expect(cot).toBeLessThan(7500);
  });

  it("coût employeur = brut + cotisations", () => {
    const c = coefficientsSalairesDepuisParametres(chargerParametresV1());
    const e = entrees(c.smicMensuelBrut);
    const cot = cotisationsPatronales(e);
    const cout = coutEmployeur(e);
    expect(cout).toBe(c.smicMensuelBrut + cot);
  });
});

describe("salaires au-dessus du SMIC", () => {
  it("salaire 2 fois SMIC : coût ≈ 2 × SMIC × 1,40 (40 % de cotisations)", () => {
    const c = coefficientsSalairesDepuisParametres(chargerParametresV1());
    const brut = Math.round(c.smicMensuelBrut * 2);
    const cout = coutEmployeur(entrees(brut));
    expect(cout).toBeGreaterThan(Math.round(brut * 1.39));
    expect(cout).toBeLessThan(Math.round(brut * 1.41));
  });
});

describe("enregistrerPaieMensuelle — écriture comptable", () => {
  it("passe 641+645 débit / 421+431 crédit, équilibre maintenu", () => {
    const c = coefficientsSalairesDepuisParametres(chargerParametresV1());
    const e = entrees(c.smicMensuelBrut);
    const cot = cotisationsPatronales(e);
    const gl = enregistrerPaieMensuelle(planComptableV1(), {
      idEcriture: "paie_m0",
      mois: moisJeu(0),
      salaireBrutMensuel: e.salaireBrutMensuel,
      cotisationsPatronales: cot,
    });
    expect(soldeCompte(gl, "641")).toBe(e.salaireBrutMensuel);
    expect(soldeCompte(gl, "645")).toBe(cot);
    expect(soldeCompte(gl, "421")).toBe(e.salaireBrutMensuel);
    expect(soldeCompte(gl, "431")).toBe(cot);
    expect(enEquilibre(gl)).toBe(true);
  });

  it("refuse une paie sans salaire", () => {
    expect(() =>
      enregistrerPaieMensuelle(planComptableV1(), {
        idEcriture: "p",
        mois: moisJeu(0),
        salaireBrutMensuel: centimes(0),
        cotisationsPatronales: centimes(0),
      }),
    ).toThrow();
  });
});
