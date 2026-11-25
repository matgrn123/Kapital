import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { calendrierDuMois, configCalendrierDepuis, type ConfigCalendrier } from "./calendrier.js";

const PARAMS = chargerParametresV1();
const CONFIG = configCalendrierDepuis(PARAMS);

function avec(cle: string, valeur: number) {
  return { ...PARAMS, [cle]: { ...PARAMS[cle]!, valeur } };
}

describe("configCalendrierDepuis", () => {
  it("lit le mois de départ (janvier) et les débuts de collections dans les paramètres", () => {
    expect(CONFIG).toEqual({ moisDepartMonde: 1, debutCollectionPE: 2, debutCollectionAH: 8 });
  });

  it("refuse un mois hors de 1 à 12, ou non entier", () => {
    for (const cle of [
      "calendrier_mois_depart_monde",
      "calendrier_mois_debut_collection_pe",
      "calendrier_mois_debut_collection_ah",
    ]) {
      expect(() => configCalendrierDepuis(avec(cle, 0))).toThrow(cle);
      expect(() => configCalendrierDepuis(avec(cle, 13))).toThrow(cle);
      expect(() => configCalendrierDepuis(avec(cle, 2.5))).toThrow(cle);
    }
  });

  it("refuse un paramètre manquant", () => {
    const { calendrier_mois_depart_monde: _retire, ...sans } = PARAMS;
    expect(() => configCalendrierDepuis(sans)).toThrow(/calendrier_mois_depart_monde/);
  });

  it("refuse une collection printemps-été qui ne commence pas avant l'automne-hiver", () => {
    expect(() => configCalendrierDepuis(avec("calendrier_mois_debut_collection_pe", 8))).toThrow(/printemps-été/);
  });
});

describe("calendrierDuMois", () => {
  it("mois 0 = janvier de l'an 1, en hiver", () => {
    const c = calendrierDuMois(0, CONFIG);
    expect(c.moisCalendaire).toBe(1);
    expect(c.annee).toBe(1);
    expect(c.saison).toBe("hiver");
  });

  it("l'exercice de 12 mois coïncide avec l'année civile : le mois 11 est un décembre", () => {
    expect(calendrierDuMois(11, CONFIG).moisCalendaire).toBe(12);
    expect(calendrierDuMois(23, CONFIG).moisCalendaire).toBe(12);
  });

  it("se répète tous les 12 mois", () => {
    for (let m = 0; m < 60; m++) {
      const a = calendrierDuMois(m, CONFIG);
      const b = calendrierDuMois(m + 12, CONFIG);
      expect(b.moisCalendaire).toBe(a.moisCalendaire);
      expect(b.saison).toBe(a.saison);
      expect(b.collection.type).toBe(a.collection.type);
      expect(b.annee).toBe(a.annee + 1);
      expect(b.collection.index).toBe(a.collection.index + 2);
    }
  });

  it("l'année change en janvier, et seulement en janvier", () => {
    for (let m = 1; m < 60; m++) {
      const avant = calendrierDuMois(m - 1, CONFIG);
      const apres = calendrierDuMois(m, CONFIG);
      if (apres.moisCalendaire === 1) expect(apres.annee).toBe(avant.annee + 1);
      else expect(apres.annee).toBe(avant.annee);
    }
  });

  it("donne les saisons météorologiques", () => {
    const saisons = Array.from({ length: 12 }, (_, m) => calendrierDuMois(m, CONFIG).saison);
    expect(saisons).toEqual([
      "hiver", "hiver", "printemps", "printemps", "printemps", "ete",
      "ete", "ete", "automne", "automne", "automne", "hiver",
    ]);
  });

  it("change de collection aux mois paramétrés (printemps-été en février, automne-hiver en août)", () => {
    const types = Array.from({ length: 12 }, (_, m) => calendrierDuMois(m, CONFIG).collection.type);
    expect(types).toEqual(["AH", "PE", "PE", "PE", "PE", "PE", "PE", "AH", "AH", "AH", "AH", "AH"]);
    // En janvier de l'an 1, on vend encore l'automne-hiver lancé en août de l'an 0.
    expect(calendrierDuMois(0, CONFIG).collection.anneeDebut).toBe(0);
    expect(calendrierDuMois(1, CONFIG).collection.anneeDebut).toBe(1);
    expect(calendrierDuMois(7, CONFIG).collection.anneeDebut).toBe(1);
    expect(calendrierDuMois(12, CONFIG).collection.anneeDebut).toBe(1);
  });

  it("l'index de collection part de 0 au mois 0, ne décroît jamais et monte de 1 à chaque nouvelle collection", () => {
    const configs: ConfigCalendrier[] = [
      CONFIG,
      { moisDepartMonde: 5, debutCollectionPE: 2, debutCollectionAH: 8 },
      { moisDepartMonde: 9, debutCollectionPE: 1, debutCollectionAH: 9 },
      { moisDepartMonde: 12, debutCollectionPE: 3, debutCollectionAH: 10 },
    ];
    for (const config of configs) {
      expect(calendrierDuMois(0, config).collection.index).toBe(0);
      for (let m = 1; m < 72; m++) {
        const avant = calendrierDuMois(m - 1, config).collection;
        const apres = calendrierDuMois(m, config).collection;
        expect(apres.index).toBeGreaterThanOrEqual(avant.index);
        if (apres.type !== avant.type) expect(apres.index).toBe(avant.index + 1);
        else expect(apres.index).toBe(avant.index);
      }
    }
  });

  it("suit un monde qui naît un autre mois que janvier", () => {
    const config = { ...CONFIG, moisDepartMonde: 9 };
    expect(calendrierDuMois(0, config)).toMatchObject({ moisCalendaire: 9, annee: 1, saison: "automne" });
    expect(calendrierDuMois(3, config)).toMatchObject({ moisCalendaire: 12, annee: 1 });
    expect(calendrierDuMois(4, config)).toMatchObject({ moisCalendaire: 1, annee: 2 });
  });

  it("refuse un mois de jeu négatif ou non entier", () => {
    expect(() => calendrierDuMois(-1, CONFIG)).toThrow();
    expect(() => calendrierDuMois(1.5, CONFIG)).toThrow();
  });

  it("refuse une configuration hors de 1 à 12", () => {
    expect(() => calendrierDuMois(0, { ...CONFIG, moisDepartMonde: 0 })).toThrow();
    expect(() => calendrierDuMois(0, { ...CONFIG, debutCollectionAH: 13 })).toThrow();
  });
});
