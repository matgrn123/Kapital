import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { MINUTES_PAR_MOIS_JEU, instantJeu } from "../types/primitifs.js";
import { configTempsDepuis, positionPasDepuisInstant } from "./temps.js";

const PARAMS = chargerParametresV1();

describe("configTempsDepuis", () => {
  it("lit le pas (1 min réelle) et le ratio (1440 min réelles par mois de jeu) dans les paramètres", () => {
    const c = configTempsDepuis(PARAMS);
    expect(c.minutesReellesParPas).toBe(1);
    expect(c.minutesReellesParMoisJeu).toBe(1440);
    expect(c.pasParMois).toBe(1440);
  });

  it("reste cohérent avec la constante historique MINUTES_PAR_MOIS_JEU", () => {
    expect(configTempsDepuis(PARAMS).minutesReellesParMoisJeu).toBe(MINUTES_PAR_MOIS_JEU);
  });

  it("refuse un pas qui ne divise pas le mois en un nombre entier de pas", () => {
    const params = {
      ...PARAMS,
      temps_minutes_reelles_par_pas: { ...PARAMS["temps_minutes_reelles_par_pas"]!, valeur: 7 },
    };
    expect(() => configTempsDepuis(params)).toThrow(/entier/);
  });

  it("refuse un paramètre manquant ou négatif ou nul", () => {
    const { temps_minutes_reelles_par_pas: _retire, ...sansPas } = PARAMS;
    expect(() => configTempsDepuis(sansPas)).toThrow(/temps_minutes_reelles_par_pas/);
    const zero = {
      ...PARAMS,
      temps_minutes_reelles_par_mois_jeu: {
        ...PARAMS["temps_minutes_reelles_par_mois_jeu"]!,
        valeur: 0,
      },
    };
    expect(() => configTempsDepuis(zero)).toThrow(/positive/);
  });
});

describe("positionPasDepuisInstant", () => {
  const config = configTempsDepuis(PARAMS);

  it("instant 0 : mois 0, premier pas", () => {
    const p = positionPasDepuisInstant(config, instantJeu(0));
    expect(p).toEqual({ mois: 0, indexDansMois: 0, estDernierPasDuMois: false });
  });

  it("1 minute plus tard : deuxième pas du mois", () => {
    expect(positionPasDepuisInstant(config, instantJeu(1)).indexDansMois).toBe(1);
  });

  it("1439 minutes : dernier pas du mois 0", () => {
    const p = positionPasDepuisInstant(config, instantJeu(1439));
    expect(p.mois).toBe(0);
    expect(p.indexDansMois).toBe(1439);
    expect(p.estDernierPasDuMois).toBe(true);
  });

  it("1440 minutes : premier pas du mois 1", () => {
    const p = positionPasDepuisInstant(config, instantJeu(1440));
    expect(p).toEqual({ mois: 1, indexDansMois: 0, estDernierPasDuMois: false });
  });

  it("un instant au milieu d'un pas appartient à ce pas", () => {
    expect(positionPasDepuisInstant(config, instantJeu(1440)).indexDansMois).toBe(0);
    expect(positionPasDepuisInstant(config, instantJeu(1440.9)).indexDansMois).toBe(0);
    expect(positionPasDepuisInstant(config, instantJeu(1441)).indexDansMois).toBe(1);
  });
});
