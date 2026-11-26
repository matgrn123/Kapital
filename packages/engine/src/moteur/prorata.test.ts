import { describe, expect, it } from "vitest";
import { auProrata, partDuMoisDepuis } from "./prorata.js";
import { debutDuMoisMs, finDuMoisMs, indexDuMois } from "./temps.js";

// Lot T4 (horloge réelle) : une embauche ou un bail signé en cours de mois ne coûte que les
// jours civils restants du mois, jour de l'embauche (ou de la signature) compris.

const NOVEMBRE_2026 = indexDuMois(2026, 11);
const FEVRIER_2027 = indexDuMois(2027, 2);
const MARS_2026 = indexDuMois(2026, 3);

describe("partDuMoisDepuis : jours civils restants / jours du mois", () => {
  it("embauche le samedi 21 novembre 2026 à 10 h (Paris) : 10 jours sur 30", () => {
    // 10 h à Paris en novembre = 9 h UTC
    expect(partDuMoisDepuis(NOVEMBRE_2026, Date.UTC(2026, 10, 21, 9, 0))).toEqual({ jours: 10, joursDuMois: 30 });
  });

  it("le jour de l'embauche compte en entier, même à 23 h 59", () => {
    expect(partDuMoisDepuis(NOVEMBRE_2026, Date.UTC(2026, 10, 21, 22, 59))).toEqual({ jours: 10, joursDuMois: 30 });
  });

  it("minuit à Paris est déjà le jour suivant (heure de Paris, pas UTC)", () => {
    // 23 h 30 UTC le 21 = 0 h 30 le 22 à Paris
    expect(partDuMoisDepuis(NOVEMBRE_2026, Date.UTC(2026, 10, 21, 23, 30))).toEqual({ jours: 9, joursDuMois: 30 });
  });

  it("le 1er à minuit, ou avant le mois : mois entier", () => {
    expect(partDuMoisDepuis(NOVEMBRE_2026, debutDuMoisMs(NOVEMBRE_2026))).toEqual({ jours: 30, joursDuMois: 30 });
    expect(partDuMoisDepuis(NOVEMBRE_2026, debutDuMoisMs(NOVEMBRE_2026) - 1)).toEqual({ jours: 30, joursDuMois: 30 });
    expect(partDuMoisDepuis(NOVEMBRE_2026, Date.UTC(2025, 0, 1))).toEqual({ jours: 30, joursDuMois: 30 });
  });

  it("date inconnue (banc d'essai, anciens tests) : mois entier", () => {
    expect(partDuMoisDepuis(NOVEMBRE_2026, undefined)).toEqual({ jours: 30, joursDuMois: 30 });
  });

  it("le dernier jour du mois : 1 jour", () => {
    expect(partDuMoisDepuis(NOVEMBRE_2026, finDuMoisMs(NOVEMBRE_2026) - 1)).toEqual({ jours: 1, joursDuMois: 30 });
  });

  it("après la fin du mois (clôture rattrapée après l'embauche) : rien", () => {
    expect(partDuMoisDepuis(NOVEMBRE_2026, finDuMoisMs(NOVEMBRE_2026))).toEqual({ jours: 0, joursDuMois: 30 });
  });

  it("février 2027 (28 jours) : embauche le 15 → 14 jours sur 28", () => {
    expect(partDuMoisDepuis(FEVRIER_2027, Date.UTC(2027, 1, 15, 8, 0))).toEqual({ jours: 14, joursDuMois: 28 });
  });

  it("mois du passage à l'heure d'été (mars 2026, 31 jours) : le 29 après 3 h → 3 jours", () => {
    // 29 mars 2026 : passage à l'heure d'été à 2 h ; 10 h à Paris = 8 h UTC
    expect(partDuMoisDepuis(MARS_2026, Date.UTC(2026, 2, 29, 8, 0))).toEqual({ jours: 3, joursDuMois: 31 });
  });
});

describe("auProrata : un seul arrondi au centime", () => {
  it("2 000 € sur 10 jours de 30 : 666,67 €", () => {
    expect(auProrata(200_000, { jours: 10, joursDuMois: 30 })).toBe(66_667);
  });

  it("mois entier : le montant tel quel (aucun écart d'arrondi)", () => {
    expect(auProrata(200_000, { jours: 30, joursDuMois: 30 })).toBe(200_000);
    expect(auProrata(3200.5, { jours: 31, joursDuMois: 31 })).toBe(3201);
  });

  it("aucun jour : 0", () => {
    expect(auProrata(200_000, { jours: 0, joursDuMois: 30 })).toBe(0);
  });

  it("un montant non entier (énergie) est arrondi une seule fois, sur le résultat", () => {
    // 15 736,3 × 10 / 30 = 5 245,43… → 5 245
    expect(auProrata(15_736.3, { jours: 10, joursDuMois: 30 })).toBe(5245);
  });
});
