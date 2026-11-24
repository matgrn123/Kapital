import { chargerParametresV1, type Parametres } from "@kapital/content";
import { describe, expect, it } from "vitest";
import {
  configTempsDepuis,
  debutDuPasEnMs,
  horlogeDepuis,
  pasAbsoluDepuisInstantReel,
  pasAbsoluDepuisPosition,
  pasTerminesDepuis,
  positionDuPasAbsolu,
} from "./temps.js";

const PARAMS = chargerParametresV1();
const CONFIG = configTempsDepuis(PARAMS); // pas de 10 min, mois de 1440 min : 144 pas
const MIN = 60_000;
const JOUR = 24 * 60 * MIN;
// Création du monde : un instant quelconque, fixé pour que les tests soient déterministes
const DEBUT = Date.UTC(2026, 10, 1, 8, 0, 0);

describe("pasTerminesDepuis", () => {
  it("0 pas terminé à la création du monde et avant la fin du premier pas", () => {
    expect(pasTerminesDepuis(CONFIG, DEBUT, DEBUT)).toBe(0);
    expect(pasTerminesDepuis(CONFIG, DEBUT, DEBUT + 10 * MIN - 1)).toBe(0);
  });

  it("un pas est terminé quand ses 10 minutes sont écoulées", () => {
    expect(pasTerminesDepuis(CONFIG, DEBUT, DEBUT + 10 * MIN)).toBe(1);
    expect(pasTerminesDepuis(CONFIG, DEBUT, DEBUT + 25 * MIN)).toBe(2);
  });

  it("un jour réel = un mois de jeu = 144 pas", () => {
    expect(pasTerminesDepuis(CONFIG, DEBUT, DEBUT + JOUR)).toBe(144);
    expect(pasTerminesDepuis(CONFIG, DEBUT, DEBUT + 3 * JOUR)).toBe(432);
  });

  it("jamais négatif, même si l'horloge du serveur est en retard sur la création du monde", () => {
    expect(pasTerminesDepuis(CONFIG, DEBUT, DEBUT - 5 * JOUR)).toBe(0);
  });

  it("refuse des instants qui ne sont pas des nombres", () => {
    expect(() => pasTerminesDepuis(CONFIG, Number.NaN, DEBUT)).toThrow();
    expect(() => pasTerminesDepuis(CONFIG, DEBUT, Number.POSITIVE_INFINITY)).toThrow();
  });

  it("suit le ratio des paramètres : un mois de 720 minutes réelles donne 72 pas", () => {
    const params: Parametres = {
      ...PARAMS,
      temps_minutes_reelles_par_mois_jeu: {
        ...PARAMS["temps_minutes_reelles_par_mois_jeu"]!,
        valeur: 720,
      },
    };
    const config = configTempsDepuis(params);
    expect(config.pasParMois).toBe(72);
    expect(pasTerminesDepuis(config, DEBUT, DEBUT + JOUR)).toBe(144);
    expect(positionDuPasAbsolu(config, 144)).toEqual({
      mois: 2,
      indexDansMois: 0,
      estDernierPasDuMois: false,
    });
  });
});

describe("positionDuPasAbsolu et pasAbsoluDepuisPosition", () => {
  it("le pas 0 ouvre le mois 0", () => {
    expect(positionDuPasAbsolu(CONFIG, 0)).toEqual({
      mois: 0,
      indexDansMois: 0,
      estDernierPasDuMois: false,
    });
  });

  it("le pas 143 est le dernier du mois 0, le pas 144 ouvre le mois 1", () => {
    expect(positionDuPasAbsolu(CONFIG, 143)).toEqual({
      mois: 0,
      indexDansMois: 143,
      estDernierPasDuMois: true,
    });
    expect(positionDuPasAbsolu(CONFIG, 144)).toEqual({
      mois: 1,
      indexDansMois: 0,
      estDernierPasDuMois: false,
    });
  });

  it("aller-retour exact sur plusieurs mois", () => {
    for (const pas of [0, 1, 143, 144, 145, 287, 288, 1000, 10_000]) {
      const p = positionDuPasAbsolu(CONFIG, pas);
      expect(pasAbsoluDepuisPosition(CONFIG, p.mois, p.indexDansMois)).toBe(pas);
    }
  });

  it("refuse un pas négatif ou non entier, ou une position hors du mois", () => {
    expect(() => positionDuPasAbsolu(CONFIG, -1)).toThrow();
    expect(() => positionDuPasAbsolu(CONFIG, 1.5)).toThrow();
    expect(() => pasAbsoluDepuisPosition(CONFIG, 0, 144)).toThrow(/pas/);
    expect(() => pasAbsoluDepuisPosition(CONFIG, -1, 0)).toThrow();
  });
});

describe("debutDuPasEnMs et pasAbsoluDepuisInstantReel", () => {
  it("le pas k commence à debut + k × 10 minutes", () => {
    expect(debutDuPasEnMs(CONFIG, DEBUT, 0)).toBe(DEBUT);
    expect(debutDuPasEnMs(CONFIG, DEBUT, 3)).toBe(DEBUT + 30 * MIN);
  });

  it("un événement tombe dans le pas dont l'intervalle le contient", () => {
    expect(pasAbsoluDepuisInstantReel(CONFIG, DEBUT, DEBUT)).toBe(0);
    expect(pasAbsoluDepuisInstantReel(CONFIG, DEBUT, DEBUT + 10 * MIN - 1)).toBe(0);
    expect(pasAbsoluDepuisInstantReel(CONFIG, DEBUT, DEBUT + 10 * MIN)).toBe(1);
    expect(pasAbsoluDepuisInstantReel(CONFIG, DEBUT, DEBUT + 48 * MIN)).toBe(4);
  });

  it("un événement daté avant la création du monde est traité au pas 0", () => {
    expect(pasAbsoluDepuisInstantReel(CONFIG, DEBUT, DEBUT - JOUR)).toBe(0);
  });

  it("cohérent avec le début de pas : début du pas k appartient au pas k, et 1 ms avant au pas k-1", () => {
    for (const k of [1, 7, 143, 144, 500]) {
      const debut = debutDuPasEnMs(CONFIG, DEBUT, k);
      expect(pasAbsoluDepuisInstantReel(CONFIG, DEBUT, debut)).toBe(k);
      expect(pasAbsoluDepuisInstantReel(CONFIG, DEBUT, debut - 1)).toBe(k - 1);
    }
  });
});

describe("horlogeDepuis : ce que tous les joueurs voient", () => {
  it("à la création du monde : mois 0, premier pas en cours", () => {
    const h = horlogeDepuis(CONFIG, DEBUT, DEBUT);
    expect(h.pasTermines).toBe(0);
    expect(h.moisEnCours).toBe(0);
    expect(h.indexDansMois).toBe(0);
    expect(h.debutPasEnCoursMs).toBe(DEBUT);
    expect(h.finPasEnCoursMs).toBe(DEBUT + 10 * MIN);
    expect(h.finDuMoisMs).toBe(DEBUT + JOUR);
  });

  it("un jour et 25 minutes plus tard : mois 1, troisième pas en cours", () => {
    const h = horlogeDepuis(CONFIG, DEBUT, DEBUT + JOUR + 25 * MIN);
    expect(h.pasTermines).toBe(146);
    expect(h.moisEnCours).toBe(1);
    expect(h.indexDansMois).toBe(2);
    expect(h.debutPasEnCoursMs).toBe(DEBUT + JOUR + 20 * MIN);
    expect(h.finPasEnCoursMs).toBe(DEBUT + JOUR + 30 * MIN);
    expect(h.finDuMoisMs).toBe(DEBUT + 2 * JOUR);
  });

  it("deux joueurs qui lisent au même instant voient exactement la même horloge", () => {
    const maintenant = DEBUT + 5 * JOUR + 123 * MIN;
    expect(horlogeDepuis(CONFIG, DEBUT, maintenant)).toEqual(horlogeDepuis(CONFIG, DEBUT, maintenant));
  });
});
