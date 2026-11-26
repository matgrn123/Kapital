import { describe, it, expect } from "vitest";
import {
  dateEtDelai,
  dateHeureLisible,
  dateLisible,
  debutDuMoisMs,
  delaiReel,
  enMois,
  estIndexCalendaire,
  finDuMoisLisible,
  finDuMoisMs,
  heureLisible,
  indexDeMois,
  indexDuMoisDe,
  instantDuJeu,
  joursDansLeMois,
  jourEcoule,
  libelleMois,
  libelleMoisCourt,
  moisCivil,
  partiesParis,
  periodeMois,
  positionDeLInstant,
  titreMois,
  ventesParJour,
  versQuand,
} from "./cadre";

// L'horloge du jeu est l'horloge réelle, à l'heure de Paris.
// Index de mois = année × 12 + (mois civil − 1) : novembre 2026 = 24322.
const MIN = 60_000;
const HEURE = 60 * MIN;
const NOVEMBRE_2026 = 24322;
const JEUDI_10H21 = Date.parse("2026-11-26T09:21:00Z"); // 10 h 21 à Paris (heure d'hiver)

describe("index de mois", () => {
  it("convertit une année et un mois civil en index, et inversement", () => {
    expect(indexDeMois(2026, 11)).toBe(NOVEMBRE_2026);
    expect(moisCivil(NOVEMBRE_2026)).toEqual({ annee: 2026, mois: 11 });
    expect(moisCivil(indexDeMois(2026, 12))).toEqual({ annee: 2026, mois: 12 });
    expect(moisCivil(indexDeMois(2027, 1))).toEqual({ annee: 2027, mois: 1 });
  });

  it("reconnaît l'ancien compteur (mois 0, 1, 2…) le temps de la transition", () => {
    expect(estIndexCalendaire(NOVEMBRE_2026)).toBe(true);
    expect(estIndexCalendaire(1200)).toBe(true);
    expect(estIndexCalendaire(1199)).toBe(false);
    expect(estIndexCalendaire(10)).toBe(false);
    expect(estIndexCalendaire(24322.5)).toBe(false);
    expect(moisCivil(10)).toBeNull();
  });

  it("nomme le mois en toutes lettres", () => {
    expect(libelleMois(NOVEMBRE_2026)).toBe("novembre 2026");
    expect(libelleMois(indexDeMois(2025, 12))).toBe("décembre 2025");
    expect(libelleMois(indexDeMois(2026, 1))).toBe("janvier 2026");
    expect(libelleMoisCourt(NOVEMBRE_2026)).toBe("nov. 2026");
    expect(libelleMoisCourt(indexDeMois(2027, 2))).toBe("févr. 2027");
    expect(enMois(indexDeMois(2026, 8))).toBe("en août 2026");
    expect(titreMois(NOVEMBRE_2026)).toBe("Novembre 2026");
  });

  it("garde « mois N » pour l'ancien compteur", () => {
    expect(libelleMois(10)).toBe("mois 10");
    expect(libelleMoisCourt(3)).toBe("mois 3");
    expect(enMois(10)).toBe("au mois 10");
    expect(titreMois(10)).toBe("Mois 10");
  });

  it("décrit une période (un exercice comptable)", () => {
    expect(periodeMois(indexDeMois(2026, 1), indexDeMois(2026, 12))).toBe("janvier à décembre 2026");
    expect(periodeMois(indexDeMois(2026, 11), indexDeMois(2027, 12))).toBe("novembre 2026 à décembre 2027");
    expect(periodeMois(0, 11)).toBeNull();
  });
});

describe("longueur et bornes des mois", () => {
  it("compte les vrais jours du mois, années bissextiles comprises", () => {
    expect(joursDansLeMois(2026, 11)).toBe(30);
    expect(joursDansLeMois(2026, 12)).toBe(31);
    expect(joursDansLeMois(2026, 2)).toBe(28);
    expect(joursDansLeMois(2028, 2)).toBe(29);
    expect(joursDansLeMois(2100, 2)).toBe(28);
    expect(joursDansLeMois(2000, 2)).toBe(29);
  });

  it("place le début du mois au 1er à minuit, heure de Paris (hiver et été)", () => {
    expect(new Date(debutDuMoisMs(NOVEMBRE_2026)).toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(new Date(debutDuMoisMs(indexDeMois(2026, 7))).toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(new Date(finDuMoisMs(NOVEMBRE_2026)).toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });

  it("retrouve le mois d'un instant à l'heure de Paris", () => {
    expect(indexDuMoisDe(JEUDI_10H21)).toBe(NOVEMBRE_2026);
    // 30 novembre, 23 h 30 UTC = 1er décembre, 0 h 30 à Paris.
    expect(indexDuMoisDe(Date.parse("2026-11-30T23:30:00Z"))).toBe(NOVEMBRE_2026 + 1);
    expect(positionDeLInstant(JEUDI_10H21)).toEqual({ mois: NOVEMBRE_2026, jour: 26 });
  });
});

describe("dates lisibles (heure de Paris)", () => {
  it("donne le jour, la date et l'heure", () => {
    expect(dateHeureLisible(JEUDI_10H21)).toBe("jeu. 26 nov. 2026, 10 h 21");
    expect(dateHeureLisible("2026-11-26T09:21:00Z")).toBe("jeu. 26 nov. 2026, 10 h 21");
    expect(dateHeureLisible("2026-07-01T06:05:00Z")).toBe("mer. 1er juil. 2026, 8 h 05");
    expect(dateHeureLisible("2026-11-30T23:00:00Z")).toBe("mar. 1er déc. 2026, 0 h 00");
  });

  it("donne la date seule, ou l'heure seule", () => {
    expect(dateLisible(JEUDI_10H21)).toBe("jeu. 26 nov. 2026");
    expect(heureLisible(JEUDI_10H21)).toBe("10 h 21");
    expect(partiesParis(JEUDI_10H21)).toEqual({ annee: 2026, mois: 11, jour: 26, heure: 10, minute: 21, jourSemaine: "jeu." });
  });

  it("ne plante pas sur une date illisible", () => {
    expect(dateHeureLisible("pas une date")).toBe("date inconnue");
    expect(dateLisible(Number.NaN)).toBe("date inconnue");
  });
});

describe("delaiReel", () => {
  it("annonce un délai à venir", () => {
    expect(delaiReel(48 * MIN)).toBe("dans 48 min");
    expect(delaiReel(3 * HEURE + 5 * MIN)).toBe("dans 3 h 05");
    expect(delaiReel(2 * HEURE)).toBe("dans 2 h");
    expect(delaiReel(3 * 24 * HEURE + 2 * HEURE)).toBe("dans 3 jours");
  });

  it("annonce un délai passé", () => {
    expect(delaiReel(-12 * MIN)).toBe("il y a 12 min");
    expect(delaiReel(-25 * HEURE)).toBe("il y a 1 jour");
  });

  it("dit « à l'instant » sous une minute", () => {
    expect(delaiReel(30_000)).toBe("à l'instant");
    expect(delaiReel(-59_000)).toBe("à l'instant");
  });
});

describe("dates avec délai", () => {
  it("donne la date et le délai réel entre parenthèses", () => {
    expect(dateEtDelai(JEUDI_10H21 + 2 * HEURE, JEUDI_10H21)).toBe("jeu. 26 nov. 2026, 12 h 21 (dans 2 h)");
    expect(dateEtDelai("2026-11-25T09:21:00Z", JEUDI_10H21)).toBe("mer. 25 nov. 2026, 10 h 21 (il y a 1 jour)");
  });

  it("annonce une livraison à l'heure près : « vers 12 h 21 (dans 2 h) »", () => {
    expect(versQuand(JEUDI_10H21 + 2 * HEURE, JEUDI_10H21)).toBe("vers 12 h 21 (dans 2 h)");
    expect(versQuand(JEUDI_10H21 - 21 * MIN, JEUDI_10H21)).toBe("vers 10 h 00 (il y a 21 min)");
  });

  it("ajoute le jour si ce n'est pas aujourd'hui, et l'année si elle change", () => {
    expect(versQuand(Date.parse("2026-11-27T07:00:00Z"), JEUDI_10H21)).toBe("vers ven. 27 nov., 8 h 00 (dans 21 h 39)");
    expect(versQuand(Date.parse("2027-01-01T08:00:00Z"), JEUDI_10H21)).toBe("vers ven. 1er janv. 2027, 9 h 00 (dans 35 jours)");
  });

  it("donne le dernier jour du mois et le délai jusqu'à la clôture", () => {
    // Le mois se clôt le 1er décembre à 0 h, heure de Paris.
    expect(finDuMoisLisible(NOVEMBRE_2026, JEUDI_10H21)).toBe("lun. 30 nov. 2026 (dans 4 jours)");
  });

  it("garde « fin du mois N » pour l'ancien compteur", () => {
    expect(finDuMoisLisible(10, JEUDI_10H21)).toBe("fin du mois 10");
  });
});

describe("instantDuJeu", () => {
  it("vaut l'instant réel quand le monde suit l'horloge réelle", () => {
    expect(instantDuJeu(JEUDI_10H21, "1970-01-01T00:00:00Z")).toBe(JEUDI_10H21);
    expect(instantDuJeu(JEUDI_10H21, null)).toBe(JEUDI_10H21);
  });

  it("suit l'avance donnée par l'outil d'administration (recette)", () => {
    expect(instantDuJeu(JEUDI_10H21, "1969-12-31T00:00:00Z")).toBe(JEUDI_10H21 + 24 * HEURE);
  });

  it("revient à l'instant réel avec l'ancien départ du monde", () => {
    expect(instantDuJeu(JEUDI_10H21, "2026-11-15T08:00:00Z")).toBe(JEUDI_10H21);
  });
});

describe("ventes par jour", () => {
  it("compte les jours écoulés du vrai mois", () => {
    expect(jourEcoule({ moisEnCours: NOVEMBRE_2026, indexDansMois: 0, pasParMois: 43_200 }, JEUDI_10H21)).toBe(26);
  });

  it("garde l'ancien découpage en 30 jours pour l'ancien compteur", () => {
    // index 432 sur 1 440 = 30 % du mois : 9 jours pleins + le jour en cours.
    expect(jourEcoule({ moisEnCours: 10, indexDansMois: 432, pasParMois: 1440 }, JEUDI_10H21)).toBe(10);
    expect(jourEcoule({ moisEnCours: 10, indexDansMois: 12, pasParMois: 0 }, JEUDI_10H21)).toBe(1);
  });

  it("divise le chiffre d'affaires du mois par les jours écoulés, arrondi au centime", () => {
    expect(ventesParJour(1_000_00, 10)).toBe(10_000);
    expect(ventesParJour(250_00, 1)).toBe(250_00);
    expect(ventesParJour(250_00, 0)).toBe(250_00);
  });

  it("ne descend pas sous zéro (retours plus élevés que les ventes)", () => {
    expect(ventesParJour(-50_00, 4)).toBe(0);
  });
});
