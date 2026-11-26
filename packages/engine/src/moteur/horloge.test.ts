import { chargerParametresV1, type Parametres } from "@kapital/content";
import { describe, expect, it } from "vitest";
import {
  configTempsDepuis,
  debutDuMoisMs,
  debutDuPasEnMs,
  heureLocaleParis,
  horlogeDepuis,
  indexDuMois,
  pasAbsoluDepuisInstantReel,
  pasAbsoluDepuisPosition,
  pasDansLeMois,
  pasTerminesDepuis,
  positionDuPasAbsolu,
} from "./temps.js";

const PARAMS = chargerParametresV1();
const CONFIG = configTempsDepuis(PARAMS); // rythme réel : 1 minute par pas
const MIN = 60_000;
const HEURE = 60 * MIN;
const JOUR = 24 * HEURE;
// En production, l'origine de l'horloge est le 1er janvier 1970 : heure du jeu = heure réelle.
const ORIGINE = 0;
const utc = (iso: string): number => Date.parse(iso);

function parHeure(): Parametres {
  return {
    ...PARAMS,
    temps_minutes_reelles_par_pas: { ...PARAMS["temps_minutes_reelles_par_pas"]!, valeur: 60 },
  };
}

describe("pasTerminesDepuis", () => {
  it("compte les minutes entièrement écoulées depuis l'origine", () => {
    expect(pasTerminesDepuis(CONFIG, ORIGINE, ORIGINE)).toBe(0);
    expect(pasTerminesDepuis(CONFIG, ORIGINE, MIN - 1)).toBe(0);
    expect(pasTerminesDepuis(CONFIG, ORIGINE, MIN)).toBe(1);
    expect(pasTerminesDepuis(CONFIG, ORIGINE, utc("2026-11-26T09:21:30Z"))).toBe(
      utc("2026-11-26T09:21:00Z") / MIN,
    );
  });

  it("un pas absolu de 2026 tient dans un entier 32 bits (companies.pas_traites)", () => {
    expect(pasTerminesDepuis(CONFIG, ORIGINE, utc("2100-01-01T00:00:00Z"))).toBeLessThan(2 ** 31 - 1);
  });

  it("jamais négatif, et refuse un instant invalide", () => {
    expect(pasTerminesDepuis(CONFIG, JOUR, 0)).toBe(0);
    expect(() => pasTerminesDepuis(CONFIG, Number.NaN, 0)).toThrow();
    expect(() => pasTerminesDepuis(CONFIG, 0, Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("positionDuPasAbsolu et pasAbsoluDepuisPosition", () => {
  const nov = indexDuMois(2026, 11);

  it("le premier pas de novembre 2026 est le 1er novembre à 0 h, heure de Paris", () => {
    const premier = utc("2026-10-31T23:00:00Z") / MIN;
    expect(positionDuPasAbsolu(CONFIG, premier)).toEqual({
      mois: nov,
      indexDansMois: 0,
      pasDansLeMois: 30 * 24 * 60,
      estDernierPasDuMois: false,
    });
    expect(positionDuPasAbsolu(CONFIG, premier - 1)).toMatchObject({
      mois: nov - 1,
      indexDansMois: (31 * 24 + 1) * 60 - 1, // octobre compte une heure de plus : dernier pas
      estDernierPasDuMois: true,
    });
  });

  it("jeudi 26 novembre 2026, 10 h 21 : pas n° 25 × 1440 + 621 du mois", () => {
    const p = positionDuPasAbsolu(CONFIG, utc("2026-11-26T09:21:00Z") / MIN);
    expect(p.mois).toBe(nov);
    expect(p.indexDansMois).toBe(25 * 1440 + 10 * 60 + 21);
  });

  it("mars (heure perdue), octobre (heure gagnée), février : dernier pas et aller-retour", () => {
    const config = configTempsDepuis(parHeure());
    for (const [annee, mois, heures] of [
      [2026, 3, 743],
      [2026, 10, 745],
      [2026, 2, 672],
      [2028, 2, 696],
      [2026, 12, 744],
    ] as const) {
      const m = indexDuMois(annee, mois);
      expect(pasDansLeMois(config, m)).toBe(heures);
      const premier = pasAbsoluDepuisPosition(config, m, 0);
      const dernier = pasAbsoluDepuisPosition(config, m, heures - 1);
      expect(dernier - premier).toBe(heures - 1);
      expect(positionDuPasAbsolu(config, dernier)).toMatchObject({ mois: m, estDernierPasDuMois: true });
      expect(positionDuPasAbsolu(config, dernier + 1)).toMatchObject({ mois: m + 1, indexDansMois: 0 });
      for (const k of [0, 1, Math.floor(heures / 2), heures - 1]) {
        const p = positionDuPasAbsolu(config, premier + k);
        expect(pasAbsoluDepuisPosition(config, p.mois, p.indexDansMois)).toBe(premier + k);
      }
    }
  });

  it("décembre → janvier : le pas qui suit le dernier de décembre est le premier de janvier", () => {
    const dec = indexDuMois(2026, 12);
    const dernier = pasAbsoluDepuisPosition(CONFIG, dec, pasDansLeMois(CONFIG, dec) - 1);
    expect(positionDuPasAbsolu(CONFIG, dernier + 1)).toMatchObject({
      mois: indexDuMois(2027, 1),
      indexDansMois: 0,
    });
    expect(heureLocaleParis((dernier + 1) * MIN)).toMatchObject({ annee: 2027, mois: 1, jour: 1, heure: 0 });
  });

  it("refuse des entrées invalides", () => {
    expect(() => positionDuPasAbsolu(CONFIG, -1)).toThrow();
    expect(() => positionDuPasAbsolu(CONFIG, 1.5)).toThrow();
    expect(() => pasAbsoluDepuisPosition(CONFIG, nov, 30 * 1440)).toThrow(/pas/);
    expect(() => pasAbsoluDepuisPosition(CONFIG, -1, 0)).toThrow();
  });
});

describe("debutDuPasEnMs et pasAbsoluDepuisInstantReel", () => {
  it("le pas k commence k minutes après l'origine", () => {
    expect(debutDuPasEnMs(CONFIG, ORIGINE, 0)).toBe(0);
    expect(debutDuPasEnMs(CONFIG, ORIGINE, 30)).toBe(30 * MIN);
    // une origine reculée (outil d'admin « avancer le temps ») décale tout d'autant
    expect(debutDuPasEnMs(CONFIG, -JOUR, 30)).toBe(30 * MIN - JOUR);
  });

  it("un événement daté tombe dans le pas qui contient son instant", () => {
    const livraison = utc("2026-11-26T11:21:30Z");
    expect(pasAbsoluDepuisInstantReel(CONFIG, ORIGINE, livraison)).toBe(utc("2026-11-26T11:21:00Z") / MIN);
  });
});

describe("horlogeDepuis : ce que tous les joueurs voient", () => {
  it("jeudi 26 novembre 2026, 10 h 21 dans la vie = 10 h 21 dans le jeu", () => {
    const maintenant = utc("2026-11-26T09:21:30Z");
    const h = horlogeDepuis(CONFIG, ORIGINE, maintenant);
    expect(h.heureJeuMs).toBe(maintenant);
    expect(heureLocaleParis(h.heureJeuMs)).toMatchObject({ annee: 2026, mois: 11, jour: 26, heure: 10, minute: 21 });
    expect(h.moisEnCours).toBe(24322);
    expect(h.pasParMois).toBe(30 * 1440);
    expect(h.indexDansMois).toBe(25 * 1440 + 621);
    expect(h.debutPasEnCoursMs).toBe(utc("2026-11-26T09:21:00Z"));
    expect(h.finPasEnCoursMs).toBe(utc("2026-11-26T09:22:00Z"));
    expect(h.finDuMoisMs).toBe(utc("2026-11-30T23:00:00Z")); // 1er décembre 0 h à Paris
  });

  it("une origine reculée d'un jour (avance du temps en recette) avance l'heure du jeu d'un jour", () => {
    const maintenant = utc("2026-11-30T12:00:00Z");
    const h = horlogeDepuis(CONFIG, -JOUR, maintenant);
    expect(h.heureJeuMs).toBe(maintenant + JOUR);
    expect(h.moisEnCours).toBe(indexDuMois(2026, 12));
    // instant réel de la fin du mois = origine + fin du mois en heure du jeu
    expect(h.finDuMoisMs).toBe(debutDuMoisMs(indexDuMois(2027, 1)) - JOUR);
  });

  it("deux joueurs qui lisent au même instant voient exactement la même horloge", () => {
    const maintenant = utc("2026-11-26T09:21:30Z");
    expect(horlogeDepuis(CONFIG, ORIGINE, maintenant)).toEqual(horlogeDepuis(CONFIG, ORIGINE, maintenant));
  });
});
