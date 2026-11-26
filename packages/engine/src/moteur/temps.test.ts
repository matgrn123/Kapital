import { chargerParametresV1, type Parametres } from "@kapital/content";
import { describe, expect, it } from "vitest";
import {
  PREMIER_MOIS_CALENDAIRE,
  configTempsDepuis,
  debutDuMoisMs,
  decalageParisHeures,
  estMoisCalendaire,
  finDuMoisMs,
  heureLocaleParis,
  indexDuMois,
  joursDansLeMois,
  moisCalendaire,
  moisDeLInstantMs,
  pasDansLeMois,
} from "./temps.js";

const PARAMS = chargerParametresV1();
const HEURE = 3_600_000;

function avecPas(minutes: number): Parametres {
  return {
    ...PARAMS,
    temps_minutes_reelles_par_pas: { ...PARAMS["temps_minutes_reelles_par_pas"]!, valeur: minutes },
  };
}

/** Instant UTC lisible pour les tests (Date n'est utilisé que dans les tests, jamais dans le moteur). */
const utc = (iso: string): number => Date.parse(iso);

describe("configTempsDepuis", () => {
  it("lit le pas (1 minute réelle) dans les paramètres", () => {
    expect(configTempsDepuis(PARAMS).minutesReellesParPas).toBe(1);
  });

  it("accepte tout pas qui divise une heure (1, 10, 60 minutes)", () => {
    for (const m of [1, 2, 5, 10, 15, 30, 60]) {
      expect(configTempsDepuis(avecPas(m)).minutesReellesParPas).toBe(m);
    }
  });

  it("refuse un pas qui ne divise pas une heure : un mois ne tomberait pas sur un début de pas", () => {
    expect(() => configTempsDepuis(avecPas(7))).toThrow(/diviser 60/);
    expect(() => configTempsDepuis(avecPas(90))).toThrow(/diviser 60/);
    expect(() => configTempsDepuis(avecPas(1.5))).toThrow(/diviser 60/);
  });

  it("refuse un paramètre manquant, négatif ou nul", () => {
    const { temps_minutes_reelles_par_pas: _retire, ...sansPas } = PARAMS;
    expect(() => configTempsDepuis(sansPas)).toThrow(/temps_minutes_reelles_par_pas/);
    expect(() => configTempsDepuis(avecPas(0))).toThrow(/positive/);
  });
});

describe("index de mois : année × 12 + (mois − 1)", () => {
  it("novembre 2026 = 24322, janvier 1970 = 23640", () => {
    expect(indexDuMois(2026, 11)).toBe(24322);
    expect(PREMIER_MOIS_CALENDAIRE).toBe(23640);
    expect(moisCalendaire(24322)).toEqual({ annee: 2026, mois: 11 });
  });

  it("décembre → janvier : on change d'année, et le 12e mois d'un exercice est décembre", () => {
    const decembre = indexDuMois(2026, 12);
    expect(decembre + 1).toBe(indexDuMois(2027, 1));
    expect(moisCalendaire(decembre + 1)).toEqual({ annee: 2027, mois: 1 });
    expect((decembre + 1) % 12).toBe(0);
  });

  it("aller-retour sur 60 ans de mois", () => {
    for (let m = indexDuMois(1990, 1); m < indexDuMois(2050, 1); m++) {
      const { annee, mois } = moisCalendaire(m);
      expect(indexDuMois(annee, mois)).toBe(m);
    }
  });

  it("refuse un mois civil hors de 1 à 12", () => {
    expect(() => indexDuMois(2026, 0)).toThrow();
    expect(() => indexDuMois(2026, 13)).toThrow();
  });

  it("reconnaît un mois de l'ancien compteur (depuis 0) comme hors calendrier", () => {
    expect(estMoisCalendaire(11)).toBe(false);
    expect(estMoisCalendaire(24322)).toBe(true);
  });
});

describe("debutDuMoisMs : le 1er à minuit, heure de Paris", () => {
  it("hiver : 1er novembre 2026 0 h à Paris = 31 octobre 23 h UTC", () => {
    expect(debutDuMoisMs(indexDuMois(2026, 11))).toBe(utc("2026-10-31T23:00:00Z"));
  });

  it("été : 1er avril 2026 0 h à Paris = 31 mars 22 h UTC", () => {
    expect(debutDuMoisMs(indexDuMois(2026, 4))).toBe(utc("2026-03-31T22:00:00Z"));
  });

  it("janvier 1970 commence une heure avant l'origine de l'horloge", () => {
    expect(debutDuMoisMs(PREMIER_MOIS_CALENDAIRE)).toBe(-HEURE);
  });

  it("le décalage pris au 1er du mois est celui de la règle de l'heure d'été (2020 à 2040)", () => {
    for (let m = indexDuMois(2020, 1); m <= indexDuMois(2040, 12); m++) {
      const debut = debutDuMoisMs(m);
      const local = heureLocaleParis(debut);
      expect({ jour: local.jour, heure: local.heure, minute: local.minute }).toEqual({
        jour: 1,
        heure: 0,
        minute: 0,
      });
      expect(local.mois).toBe(moisCalendaire(m).mois);
    }
  });

  it("finDuMoisMs est le début du mois suivant", () => {
    const m = indexDuMois(2026, 12);
    expect(finDuMoisMs(m)).toBe(debutDuMoisMs(m + 1));
    expect(finDuMoisMs(m)).toBe(utc("2026-12-31T23:00:00Z"));
  });
});

describe("pasDansLeMois : les mois ont leur vraie longueur", () => {
  const parHeure = configTempsDepuis(avecPas(60));
  const reel = configTempsDepuis(PARAMS);

  it("mars 2026 : 31 jours moins l'heure perdue au passage à l'heure d'été (743 h)", () => {
    expect(pasDansLeMois(parHeure, indexDuMois(2026, 3))).toBe(31 * 24 - 1);
  });

  it("octobre 2026 : 31 jours plus l'heure gagnée au retour à l'heure d'hiver (745 h)", () => {
    expect(pasDansLeMois(parHeure, indexDuMois(2026, 10))).toBe(31 * 24 + 1);
  });

  it("février : 28 jours, 29 les années bissextiles", () => {
    expect(pasDansLeMois(parHeure, indexDuMois(2026, 2))).toBe(28 * 24);
    expect(pasDansLeMois(parHeure, indexDuMois(2028, 2))).toBe(29 * 24);
    expect(pasDansLeMois(parHeure, indexDuMois(2100, 2))).toBe(28 * 24); // pas bissextile
    expect(pasDansLeMois(parHeure, indexDuMois(2000, 2))).toBe(29 * 24); // bissextile
  });

  it("au rythme réel (1 minute par pas) : 44 640 pas pour un mois de 31 jours sans changement d'heure", () => {
    expect(pasDansLeMois(reel, indexDuMois(2026, 12))).toBe(44_640);
    expect(pasDansLeMois(reel, indexDuMois(2026, 11))).toBe(43_200);
  });

  it("joursDansLeMois", () => {
    expect(joursDansLeMois(indexDuMois(2026, 11))).toBe(30);
    expect(joursDansLeMois(indexDuMois(2026, 12))).toBe(31);
    expect(joursDansLeMois(indexDuMois(2024, 2))).toBe(29);
  });
});

describe("heureLocaleParis : heure de Paris sans Intl", () => {
  it("jeudi 26 novembre 2026, 10 h 21 à Paris = 9 h 21 UTC", () => {
    expect(heureLocaleParis(utc("2026-11-26T09:21:00Z"))).toEqual({
      annee: 2026,
      mois: 11,
      jour: 26,
      heure: 10,
      minute: 21,
      jourSemaine: 4,
      decalageHeures: 1,
    });
  });

  it("passage à l'heure d'été le dernier dimanche de mars (29 mars 2026, 2 h → 3 h)", () => {
    const avant = heureLocaleParis(utc("2026-03-29T00:59:00Z"));
    const apres = heureLocaleParis(utc("2026-03-29T01:00:00Z"));
    expect([avant.heure, avant.minute, avant.decalageHeures]).toEqual([1, 59, 1]);
    expect([apres.heure, apres.minute, apres.decalageHeures]).toEqual([3, 0, 2]);
    expect(apres.jourSemaine).toBe(7);
  });

  it("retour à l'heure d'hiver le dernier dimanche d'octobre (25 octobre 2026, 3 h → 2 h)", () => {
    const avant = heureLocaleParis(utc("2026-10-25T00:59:00Z"));
    const apres = heureLocaleParis(utc("2026-10-25T01:00:00Z"));
    expect([avant.heure, avant.minute, avant.decalageHeures]).toEqual([2, 59, 2]);
    expect([apres.heure, apres.minute, apres.decalageHeures]).toEqual([2, 0, 1]);
  });

  it("concorde avec les dates de changement d'heure connues (2025 à 2030)", () => {
    const debutsEte = ["2025-03-30", "2026-03-29", "2027-03-28", "2028-03-26", "2029-03-25", "2030-03-31"];
    const finsEte = ["2025-10-26", "2026-10-25", "2027-10-31", "2028-10-29", "2029-10-28", "2030-10-27"];
    for (const j of debutsEte) {
      expect(decalageParisHeures(utc(`${j}T00:59:59Z`))).toBe(1);
      expect(decalageParisHeures(utc(`${j}T01:00:00Z`))).toBe(2);
    }
    for (const j of finsEte) {
      expect(decalageParisHeures(utc(`${j}T00:59:59Z`))).toBe(2);
      expect(decalageParisHeures(utc(`${j}T01:00:00Z`))).toBe(1);
    }
  });

  it("passage de l'année : 31 décembre 23 h UTC = 1er janvier 0 h à Paris", () => {
    const l = heureLocaleParis(utc("2026-12-31T23:00:00Z"));
    expect([l.annee, l.mois, l.jour, l.heure]).toEqual([2027, 1, 1, 0]);
  });
});

describe("moisDeLInstantMs", () => {
  it("rattache chaque instant à son mois, bornes comprises", () => {
    const nov = indexDuMois(2026, 11);
    expect(moisDeLInstantMs(debutDuMoisMs(nov))).toBe(nov);
    expect(moisDeLInstantMs(debutDuMoisMs(nov) - 1)).toBe(nov - 1);
    expect(moisDeLInstantMs(finDuMoisMs(nov) - 1)).toBe(nov);
    expect(moisDeLInstantMs(finDuMoisMs(nov))).toBe(nov + 1);
  });

  it("l'origine de l'horloge (1er janvier 1970, 1 h à Paris) est en janvier 1970", () => {
    expect(moisDeLInstantMs(0)).toBe(PREMIER_MOIS_CALENDAIRE);
  });
});
