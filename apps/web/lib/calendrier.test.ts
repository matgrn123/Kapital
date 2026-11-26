import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { indexDeMois } from "./cadre";
import {
  collectionDuMois,
  configCollectionsDepuis,
  friseDesDouzeMois,
  nomCollection,
  saisonDuMois,
  type EntreesFrise,
} from "./calendrier";

// La frise montre la vraie année civile (heure de Paris) : novembre 2026 = index 24322.
const JEUDI_26_NOV_2026 = Date.parse("2026-11-26T09:21:00Z");
const MARS_2026 = Date.parse("2026-03-10T12:00:00Z");
const VIDE: EntreesFrise = { maintenantJeuMs: JEUDI_26_NOV_2026, echeances: [], livraisons: [], finsDeBail: [] };
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

describe("friseDesDouzeMois", () => {
  it("montre les 12 mois à venir à partir du mois en cours, avec leurs vrais jours et leur année", () => {
    const f = friseDesDouzeMois(VIDE, CONFIG);
    expect(f.mois.map((x) => x.index)).toEqual(Array.from({ length: 12 }, (_, i) => m(2026, 11) + i));
    expect(f.mois[0]).toMatchObject({ nom: "novembre", annee: 2026, etat: "en_cours" });
    expect(f.mois[1]).toMatchObject({ nom: "décembre", annee: 2026, etat: "a_venir" });
    // L'année change en janvier.
    expect(f.mois[2]).toMatchObject({ nom: "janvier", annee: 2027 });
    expect(f.mois[3]!.jours).toBe(28); // février 2027
    expect(f.mois[11]).toMatchObject({ nom: "octobre", annee: 2027 });
    expect(f.periode).toBe("novembre 2026 à octobre 2027");
    expect(f.aujourdhui).toEqual({ mois: m(2026, 11), jour: 26 });
  });

  it("n'affiche aucun mois passé : un seul mois en cours, les autres à venir", () => {
    const f = friseDesDouzeMois(VIDE, CONFIG);
    expect(f.mois.map((x) => x.etat)).toEqual(["en_cours", ...Array<string>(11).fill("a_venir")]);
  });

  it("va de janvier à décembre de la même année quand on est en janvier", () => {
    const f = friseDesDouzeMois({ ...VIDE, maintenantJeuMs: Date.parse("2027-01-15T12:00:00Z") }, CONFIG);
    expect(f.mois[0]).toMatchObject({ nom: "janvier", annee: 2027 });
    expect(f.mois[11]).toMatchObject({ nom: "décembre", annee: 2027 });
    expect(f.periode).toBe("janvier à décembre 2027");
  });

  it("donne des abréviations sans ambiguïté : juin et juillet ne se confondent pas", () => {
    const f = friseDesDouzeMois({ ...VIDE, maintenantJeuMs: MARS_2026 }, CONFIG);
    const abreges = f.mois.map((x) => x.abrege);
    expect(abreges).toEqual(["mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc.", "janv.", "févr."]);
    expect(new Set(abreges).size).toBe(12);
  });

  it("donne la saison et la collection de chaque mois", () => {
    const f = friseDesDouzeMois(VIDE, CONFIG);
    expect(f.mois[0]).toMatchObject({ saison: "automne", collection: { type: "AH", annee: 2026 } });
    expect(f.mois[2]).toMatchObject({ saison: "hiver", collection: { type: "AH", annee: 2026 } }); // janvier 2027
    expect(f.mois[3]).toMatchObject({ collection: { type: "PE", annee: 2027 } }); // février 2027
  });

  it("annonce chaque fin de mois, l'arrivée des collections et la clôture de l'exercice le 31 décembre", () => {
    const f = friseDesDouzeMois(VIDE, CONFIG);
    for (const x of f.mois) {
      const fin = x.evenements.find((e) => e.type === "fin_de_mois");
      expect(fin?.jour).toBe(x.jours);
    }
    expect(f.mois[3]!.evenements.find((e) => e.type === "collection")).toMatchObject({
      jour: 1,
      libelle: "Nouvelle collection printemps-été 2027",
    });
    expect(f.mois[9]!.evenements.some((e) => e.type === "collection")).toBe(true); // août 2027
    expect(f.mois[0]!.evenements.some((e) => e.type === "collection")).toBe(false);
    const clotures = f.mois.filter((x) => x.evenements.some((e) => e.type === "cloture_exercice"));
    expect(clotures.map((x) => `${x.nom} ${x.annee}`)).toEqual(["décembre 2026"]);
    expect(clotures[0]!.evenements.find((e) => e.type === "cloture_exercice")?.jour).toBe(31);
  });

  it("place les échéances, les livraisons et les fins de bail à leur vrai jour, triées", () => {
    const f = friseDesDouzeMois(
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
    const decembre = f.mois[1]!;
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
    const f = friseDesDouzeMois(
      { ...VIDE, echeances: [{ moisJeu: 12, instantPrevu: "2026-11-28T09:00:00Z", mensualiteCentimes: 100_00 }] },
      CONFIG,
    );
    expect(f.mois[0]!.evenements.find((e) => e.type === "echeance_pret")?.jour).toBe(28);
  });

  it("met de côté ce qui tombe après les 12 mois, et ce qui n'a pas encore de vraie date", () => {
    const f = friseDesDouzeMois(
      {
        ...VIDE,
        echeances: [
          { moisJeu: m(2027, 10), instantPrevu: null, mensualiteCentimes: 100_00 },
          { moisJeu: m(2027, 12), instantPrevu: null, mensualiteCentimes: 100_00 },
          { moisJeu: m(2027, 11), instantPrevu: null, mensualiteCentimes: 100_00 },
        ],
        finsDeBail: [{ mois: 14, libelle: "Fin du bail : atelier" }],
      },
      CONFIG,
    );
    expect(f.mois[11]!.evenements.some((e) => e.type === "echeance_pret")).toBe(true);
    expect(f.plusTard).toEqual([
      { quand: "30 novembre 2027", libelle: "Échéance de prêt : 100,00 €" },
      { quand: "31 décembre 2027", libelle: "Échéance de prêt : 100,00 €" },
      { quand: "mois 14", libelle: "Fin du bail : atelier" },
    ]);
  });

  it("met à part une livraison en retard d'un mois passé, tant qu'elle n'est pas traitée", () => {
    const f = friseDesDouzeMois({ ...VIDE, livraisons: [{ instant: "2026-10-03T10:00:00Z", libelle: "Livraison en retard" }] }, CONFIG);
    expect(f.mois.flatMap((x) => x.evenements).some((e) => e.type === "livraison")).toBe(false);
    expect(f.enRetard).toEqual([{ quand: "3 octobre 2026", libelle: "Livraison en retard" }]);
  });

  it("ignore une date illisible", () => {
    const f = friseDesDouzeMois({ ...VIDE, livraisons: [{ instant: "pas une date", libelle: "?" }] }, CONFIG);
    expect(f.mois.flatMap((x) => x.evenements).some((e) => e.type === "livraison")).toBe(false);
    expect(f.enRetard).toEqual([]);
  });
});
