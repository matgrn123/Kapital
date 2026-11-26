import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { indexDeMois } from "./cadre";
import {
  collectionDuMois,
  configCollectionsDepuis,
  friseDeLAnnee,
  nomCollection,
  saisonDuMois,
  type EntreesFrise,
} from "./calendrier";

// La frise montre la vraie année civile (heure de Paris) : novembre 2026 = index 24322.
const JEUDI_26_NOV_2026 = Date.parse("2026-11-26T09:21:00Z");
const MARS_2026 = Date.parse("2026-03-10T12:00:00Z");
const VIDE: EntreesFrise = { maintenantJeuMs: JEUDI_26_NOV_2026, moisCreation: null, echeances: [], livraisons: [], finsDeBail: [] };
const CONFIG = { debutPE: 2, debutAH: 8 };
const m = (annee: number, mois: number) => indexDeMois(annee, mois);

describe("configCollectionsDepuis", () => {
  it("lit les débuts de collection dans les paramètres (février et août)", () => {
    expect(configCollectionsDepuis(chargerParametresV1())).toEqual(CONFIG);
  });

  it("refuse un mois hors de 1 à 12, ou une collection printemps-été après l'automne-hiver", () => {
    const params = chargerParametresV1();
    const avec = (cle: string, valeur: number) => ({ ...params, [cle]: { ...params[cle]!, valeur } });
    expect(() => configCollectionsDepuis(avec("calendrier_mois_debut_collection_pe", 0))).toThrow(/calendrier_mois_debut_collection_pe/);
    expect(() => configCollectionsDepuis(avec("calendrier_mois_debut_collection_ah", 13))).toThrow(/calendrier_mois_debut_collection_ah/);
    expect(() => configCollectionsDepuis(avec("calendrier_mois_debut_collection_pe", 9))).toThrow(/printemps-été/);
  });
});

describe("saisons et collections", () => {
  it("donne les saisons météorologiques", () => {
    const saisons = Array.from({ length: 12 }, (_, i) => saisonDuMois(i + 1));
    expect(saisons).toEqual([
      "hiver", "hiver", "printemps", "printemps", "printemps", "ete",
      "ete", "ete", "automne", "automne", "automne", "hiver",
    ]);
  });

  it("change de collection en février et en août", () => {
    expect(collectionDuMois(2027, 1, CONFIG)).toEqual({ type: "AH", annee: 2026 });
    expect(collectionDuMois(2027, 2, CONFIG)).toEqual({ type: "PE", annee: 2027 });
    expect(collectionDuMois(2027, 7, CONFIG)).toEqual({ type: "PE", annee: 2027 });
    expect(collectionDuMois(2027, 8, CONFIG)).toEqual({ type: "AH", annee: 2027 });
    expect(nomCollection({ type: "PE", annee: 2027 })).toBe("printemps-été 2027");
    expect(nomCollection({ type: "AH", annee: 2026 })).toBe("automne-hiver 2026");
  });
});

describe("friseDeLAnnee", () => {
  it("montre les 12 mois de l'année civile en cours, de janvier à décembre, avec leurs vrais jours", () => {
    const f = friseDeLAnnee(VIDE, CONFIG);
    expect(f.annee).toBe(2026);
    expect(f.mois.map((x) => x.index)).toEqual(Array.from({ length: 12 }, (_, i) => m(2026, i + 1)));
    expect(f.mois[0]!.nom).toBe("janvier");
    expect(f.mois[1]!.jours).toBe(28);
    expect(f.mois[11]!.nom).toBe("décembre");
    expect(f.aujourdhui).toEqual({ mois: m(2026, 11), jour: 26 });
  });

  it("distingue les mois passés, le mois en cours, les mois à venir et ceux d'avant la société", () => {
    const f = friseDeLAnnee({ ...VIDE, maintenantJeuMs: MARS_2026, moisCreation: m(2026, 2) }, CONFIG);
    expect(f.mois.slice(0, 4).map((x) => x.etat)).toEqual(["avant_la_societe", "passe", "en_cours", "a_venir"]);
  });

  it("donne la saison et la collection de chaque mois", () => {
    const f = friseDeLAnnee(VIDE, CONFIG);
    expect(f.mois[0]).toMatchObject({ saison: "hiver", collection: { type: "AH", annee: 2025 } });
    expect(f.mois[6]).toMatchObject({ saison: "ete", collection: { type: "PE", annee: 2026 } });
  });

  it("annonce chaque fin de mois, l'arrivée des collections et la clôture de l'exercice le 31 décembre", () => {
    const f = friseDeLAnnee(VIDE, CONFIG);
    for (const x of f.mois) {
      const fin = x.evenements.find((e) => e.type === "fin_de_mois");
      expect(fin?.jour).toBe(x.jours);
    }
    expect(f.mois[1]!.evenements.find((e) => e.type === "collection")).toMatchObject({
      jour: 1,
      libelle: "Nouvelle collection printemps-été 2026",
    });
    expect(f.mois[7]!.evenements.some((e) => e.type === "collection")).toBe(true);
    expect(f.mois[0]!.evenements.some((e) => e.type === "collection")).toBe(false);
    const clotures = f.mois.filter((x) => x.evenements.some((e) => e.type === "cloture_exercice"));
    expect(clotures.map((x) => x.nom)).toEqual(["décembre"]);
    expect(clotures[0]!.evenements.find((e) => e.type === "cloture_exercice")?.jour).toBe(31);
  });

  it("place les échéances, les livraisons et les fins de bail à leur vrai jour, triées", () => {
    const f = friseDeLAnnee(
      {
        ...VIDE,
        echeances: [{ moisJeu: m(2026, 12), instantPrevu: null, mensualiteCentimes: 512_34 }],
        livraisons: [
          { instant: "2026-12-20T10:00:00Z", libelle: "Livraison : 300 m de jersey" },
          { instant: "2026-12-04T10:00:00Z", libelle: "Livraison : 100 t-shirts" },
        ],
        finsDeBail: [{ mois: m(2026, 12), libelle: "Fin du bail : atelier du centre" }],
      },
      CONFIG,
    );
    const decembre = f.mois[11]!;
    expect(decembre.evenements.map((e) => [e.jour, e.type])).toEqual([
      [1, "fin_de_bail"],
      [4, "livraison"],
      [20, "livraison"],
      [31, "echeance_pret"],
      [31, "cloture_exercice"],
      [31, "fin_de_mois"],
    ]);
    expect(decembre.evenements[1]!.libelle).toBe("Livraison : 100 t-shirts");
    expect(decembre.evenements[3]!.libelle).toBe("Échéance de prêt : 512,34 €");
  });

  it("place une échéance de l'ancien compteur d'après son instant prévu", () => {
    const f = friseDeLAnnee(
      { ...VIDE, echeances: [{ moisJeu: 12, instantPrevu: "2026-11-28T09:00:00Z", mensualiteCentimes: 100_00 }] },
      CONFIG,
    );
    expect(f.mois[10]!.evenements.find((e) => e.type === "echeance_pret")?.jour).toBe(28);
  });

  it("met de côté ce qui tombe après décembre, et ce qui n'a pas encore de vraie date", () => {
    const f = friseDeLAnnee(
      {
        ...VIDE,
        echeances: [
          { moisJeu: m(2026, 12), instantPrevu: null, mensualiteCentimes: 100_00 },
          { moisJeu: m(2027, 2), instantPrevu: null, mensualiteCentimes: 100_00 },
          { moisJeu: m(2027, 1), instantPrevu: null, mensualiteCentimes: 100_00 },
        ],
        finsDeBail: [{ mois: 14, libelle: "Fin du bail : atelier" }],
      },
      CONFIG,
    );
    expect(f.plusTard).toEqual([
      { quand: "31 janvier 2027", libelle: "Échéance de prêt : 100,00 €" },
      { quand: "28 février 2027", libelle: "Échéance de prêt : 100,00 €" },
      { quand: "mois 14", libelle: "Fin du bail : atelier" },
    ]);
  });

  it("garde une livraison en retard dans un mois passé de l'année, tant qu'elle n'est pas traitée", () => {
    const f = friseDeLAnnee({ ...VIDE, livraisons: [{ instant: "2026-10-03T10:00:00Z", libelle: "Livraison en retard" }] }, CONFIG);
    expect(f.mois[9]!.evenements.some((e) => e.type === "livraison")).toBe(true);
  });

  it("ignore une date illisible", () => {
    const f = friseDeLAnnee({ ...VIDE, livraisons: [{ instant: "pas une date", libelle: "?" }] }, CONFIG);
    expect(f.mois.flatMap((x) => x.evenements).some((e) => e.type === "livraison")).toBe(false);
  });
});
