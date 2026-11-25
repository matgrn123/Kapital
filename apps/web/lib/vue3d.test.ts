import { describe, it, expect } from "vitest";
import { EMPLACEMENTS_LIBRES, EMPLACEMENTS_FIXES, nomLisibleSociete, placerActeurs, raccourcirEnseigne, type ActeurVillage } from "./vue3d";

const A = (id: string, genre: ActeurVillage["genre"]): ActeurVillage => ({ id, genre });

const VILLAGE: ActeurVillage[] = [
  A("moi", "joueur"),
  A("banque", "banque"),
  A("terrain", "terrain"),
  A("f2", "fournisseur"),
  A("f1", "fournisseur"),
  A("fa1", "faconnier"),
  A("c1", "concurrent"),
  A("c2", "concurrent"),
];

function chevauche(a: { x: number; y: number; w: number; d: number }, b: typeof a) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
}

describe("placerActeurs", () => {
  it("place la société, la banque et le terrain sur leurs emplacements fixes", () => {
    const { places } = placerActeurs(VILLAGE);
    const moi = places.find((p) => p.id === "moi")!;
    expect({ x: moi.x, y: moi.y, w: moi.w, d: moi.d }).toEqual(EMPLACEMENTS_FIXES.joueur);
    expect(places.find((p) => p.id === "banque")).toMatchObject(EMPLACEMENTS_FIXES.banque);
    expect(places.find((p) => p.id === "terrain")).toMatchObject(EMPLACEMENTS_FIXES.terrain);
  });

  it("est déterministe : même entrée, même plan, quel que soit l'ordre", () => {
    const a = placerActeurs(VILLAGE);
    const b = placerActeurs([...VILLAGE].reverse());
    const tri = (l: typeof a.places) => [...l].sort((x, y) => x.id.localeCompare(y.id));
    expect(tri(a.places)).toEqual(tri(b.places));
  });

  it("aucun bâtiment n'en chevauche un autre", () => {
    const { places } = placerActeurs(VILLAGE);
    for (let i = 0; i < places.length; i++)
      for (let j = i + 1; j < places.length; j++) expect(chevauche(places[i]!, places[j]!)).toBe(false);
    const tous = [...Object.values(EMPLACEMENTS_FIXES), ...EMPLACEMENTS_LIBRES];
    for (let i = 0; i < tous.length; i++)
      for (let j = i + 1; j < tous.length; j++) expect(chevauche(tous[i]!, tous[j]!)).toBe(false);
  });

  it("alterne les genres pour que chacun soit représenté", () => {
    const { places } = placerActeurs(VILLAGE);
    const libres = places.filter((p) => !["joueur", "banque", "terrain"].includes(p.genre));
    expect(libres.slice(0, 3).map((p) => p.genre)).toEqual(["fournisseur", "faconnier", "concurrent"]);
    expect(libres[0]!.id).toBe("f1");
  });

  it("met de côté ceux qui n'ont plus de place", () => {
    const beaucoup = Array.from({ length: EMPLACEMENTS_LIBRES.length + 3 }, (_, i) => A(`c${String(i).padStart(2, "0")}`, "concurrent"));
    const r = placerActeurs(beaucoup);
    expect(r.places).toHaveLength(EMPLACEMENTS_LIBRES.length);
    expect(r.nonPlaces).toHaveLength(3);
  });

  it("un village vide ne plante pas", () => {
    expect(placerActeurs([])).toEqual({ places: [], nonPlaces: [] });
  });
});

describe("raccourcirEnseigne", () => {
  it("met en capitales et garde les premiers mots qui tiennent", () => {
    expect(raccourcirEnseigne("Atelier du Nord")).toBe("ATELIER DU NORD");
    expect(raccourcirEnseigne("Une société au nom vraiment très long", 12)).toBe("UNE SOCIÉTÉ");
    expect(raccourcirEnseigne("Anticonstitutionnellement", 10)).toBe("ANTICONST…");
  });
});

describe("nomLisibleSociete", () => {
  it("retire le préfixe technique des sociétés du jeu", () => {
    expect(nomLisibleSociete("PNJ_Bazaar Mode")).toBe("Bazaar Mode");
    expect(nomLisibleSociete("PNJ_Noble_Couture")).toBe("Noble Couture");
    expect(nomLisibleSociete("Robot Testeur")).toBe("Robot Testeur");
  });
});
