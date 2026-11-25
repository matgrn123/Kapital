import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import {
  coefficientsSalairesDepuisParametres,
  coutEmployeur,
  ecriturePaiementPaie,
  evaluerEmbauche,
} from "./calculs.js";
import { centimes, moisJeu } from "../types/primitifs.js";

const C = coefficientsSalairesDepuisParametres(chargerParametresV1());
const SMIC = C.smicMensuelBrut;

describe("evaluerEmbauche", () => {
  it("refuse sous le SMIC avec le manque chiffré", () => {
    const r = evaluerEmbauche(SMIC - 1, 10_000_000_00, C, 2);
    expect(r).toMatchObject({ ok: false, code: "salaire_sous_smic", manque: 1 });
  });
  it("refuse un salaire nul ou non entier", () => {
    expect(evaluerEmbauche(0, 1e9, C, 2).ok).toBe(false);
    expect(evaluerEmbauche(SMIC + 0.5, 1e9, C, 2).ok).toBe(false);
  });
  it("réserve = mois × coût employeur du moteur (et non plus ×1,42 en dur)", () => {
    const salaire = 200_000;
    const cout = coutEmployeur({ salaireBrutMensuel: centimes(salaire), ...C });
    expect(evaluerEmbauche(salaire, cout * 2, C, 2).ok).toBe(true);
    const r = evaluerEmbauche(salaire, cout * 2 - 1, C, 2);
    expect(r).toMatchObject({ ok: false, code: "tresorerie_insuffisante", manque: 1 });
  });
});

describe("ecriturePaiementPaie", () => {
  it("421 + 431 au débit, 512 au crédit, équilibrée", () => {
    const e = ecriturePaiementPaie({ idEcriture: "x", mois: moisJeu(1), libelle: "Paiement", salaireBrutMensuel: centimes(1000), cotisationsPatronales: centimes(300) });
    expect(e.lignes).toEqual([
      { compte: "421", sens: "debit", montant: 1000 },
      { compte: "431", sens: "debit", montant: 300 },
      { compte: "512", sens: "credit", montant: 1300 },
    ]);
  });
});
