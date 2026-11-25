import { describe, expect, it } from "vitest";
import { friseDeLAnnee } from "./calendrier";

// Monde né en janvier de l'an 1 : le mois de jeu 0 est janvier, le 12 est janvier de l'an 2.
const VIDE = { echeances: [], livraisons: [], finsDeBail: [] };

describe("friseDeLAnnee", () => {
  it("montre les 12 mois de l'année de jeu en cours, de janvier à décembre", () => {
    const f = friseDeLAnnee({ ...VIDE, moisCourant: 14 });
    expect(f.annee).toBe(2);
    expect(f.mois.map((m) => m.moisJeu)).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
    expect(f.mois[0]!.nom).toBe("janvier");
    expect(f.mois[11]!.nom).toBe("décembre");
  });

  it("distingue les mois passés, le mois en cours et les mois à venir", () => {
    const f = friseDeLAnnee({ ...VIDE, moisCourant: 2 });
    expect(f.mois.slice(0, 4).map((m) => m.etat)).toEqual(["passe", "passe", "en_cours", "a_venir"]);
  });

  it("donne la saison et la collection de chaque mois", () => {
    const f = friseDeLAnnee({ ...VIDE, moisCourant: 0 });
    expect(f.mois[0]).toMatchObject({ saison: "hiver", collection: { type: "AH" } });
    expect(f.mois[6]).toMatchObject({ saison: "ete", collection: { type: "PE" } });
  });

  it("annonce chaque fin de mois, l'arrivée des collections et la clôture de l'exercice en décembre", () => {
    const f = friseDeLAnnee({ ...VIDE, moisCourant: 0 });
    for (const m of f.mois) expect(m.evenements.some((e) => e.type === "fin_de_mois")).toBe(true);
    expect(f.mois[1]!.evenements.some((e) => e.type === "collection")).toBe(true);
    expect(f.mois[7]!.evenements.some((e) => e.type === "collection")).toBe(true);
    expect(f.mois[0]!.evenements.some((e) => e.type === "collection")).toBe(false);
    const clotures = f.mois.filter((m) => m.evenements.some((e) => e.type === "cloture_exercice"));
    expect(clotures.map((m) => m.nom)).toEqual(["décembre"]);
  });

  it("place les échéances, les livraisons et les fins de bail dans leur mois, triées par jour", () => {
    const f = friseDeLAnnee({
      moisCourant: 1,
      echeances: [{ mois: 3, mensualiteCentimes: 512_34 }],
      livraisons: [
        { mois: 3, jour: 20, libelle: "Livraison : 300 m de jersey" },
        { mois: 3, jour: 4, libelle: "Livraison : 100 t-shirts" },
      ],
      finsDeBail: [{ mois: 5, libelle: "Fin du bail : atelier du centre" }],
    });
    const avril = f.mois[3]!;
    expect(avril.evenements.map((e) => e.type)).toEqual(["livraison", "livraison", "echeance_pret", "fin_de_mois"]);
    expect(avril.evenements[0]!.libelle).toBe("Livraison : 100 t-shirts");
    expect(avril.evenements[2]!.libelle).toBe("Échéance de prêt : 512,34 €");
    expect(f.mois[5]!.evenements.some((e) => e.type === "fin_de_bail")).toBe(true);
  });

  it("met de côté ce qui tombe après la fin de l'année", () => {
    const f = friseDeLAnnee({
      ...VIDE,
      moisCourant: 10,
      echeances: [{ mois: 11, mensualiteCentimes: 100_00 }, { mois: 12, mensualiteCentimes: 100_00 }, { mois: 13, mensualiteCentimes: 100_00 }],
    });
    expect(f.plusTard).toEqual([
      { moisJeu: 12, quand: "janvier, an 2", libelle: "Échéance de prêt : 100,00 €" },
      { moisJeu: 13, quand: "février, an 2", libelle: "Échéance de prêt : 100,00 €" },
    ]);
  });

  it("garde une livraison attendue dans un mois passé, tant qu'elle n'est pas traitée", () => {
    const f = friseDeLAnnee({ ...VIDE, moisCourant: 4, livraisons: [{ mois: 1, jour: 3, libelle: "Livraison en retard" }] });
    expect(f.mois[1]!.evenements.some((e) => e.type === "livraison")).toBe(true);
  });
});
