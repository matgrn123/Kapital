import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import {
  centimes,
  idEntreprise,
  type IdEntreprise,
} from "../types/primitifs.js";
import {
  partsDeMarche,
  segmentDepuisParametres,
  type OffreEntreprise,
  type SegmentAttraction,
} from "./index.js";

const A = idEntreprise("A");
const B = idEntreprise("B");
const C = idEntreprise("C");

function offreStandard(
  id: IdEntreprise,
  prix = 1500,
  overrides: Partial<OffreEntreprise> = {},
): OffreEntreprise {
  return {
    entreprise: id,
    qualite: 60,
    notoriete: 50,
    desirabilite: 50,
    presenceRevendeur: 0.5,
    prix: centimes(prix),
    ...overrides,
  };
}

function segmentEntree(): SegmentAttraction {
  return segmentDepuisParametres(chargerParametresV1(), "entree", 1500);
}

function segmentHaut(): SegmentAttraction {
  return segmentDepuisParametres(chargerParametresV1(), "haut", 15000);
}

describe("partsDeMarche — bornes et invariants", () => {
  it("somme des parts (firmes + frange) = 1", () => {
    const seg = segmentEntree();
    const r = partsDeMarche(seg, [offreStandard(A), offreStandard(B)]);
    const total = r.partFrange + r.parts[A]! + r.parts[B]!;
    expect(total).toBeCloseTo(1, 10);
  });

  it("chaque part est entre 0 et 1", () => {
    const seg = segmentEntree();
    const r = partsDeMarche(seg, [offreStandard(A), offreStandard(B), offreStandard(C)]);
    expect(r.partFrange).toBeGreaterThan(0);
    expect(r.partFrange).toBeLessThan(1);
    for (const id of [A, B, C]) {
      expect(r.parts[id]!).toBeGreaterThan(0);
      expect(r.parts[id]!).toBeLessThan(1);
    }
  });

  it("deux firmes identiques ont la même part", () => {
    const seg = segmentEntree();
    const r = partsDeMarche(seg, [offreStandard(A), offreStandard(B)]);
    expect(r.parts[A]!).toBeCloseTo(r.parts[B]!, 10);
  });
});

describe("critère T08 — baisser son prix fait monter sa part", () => {
  it("entrée de gamme : baisse de prix → hausse de part", () => {
    const seg = segmentEntree();
    const avant = partsDeMarche(seg, [
      offreStandard(A, 1500),
      offreStandard(B, 1500),
    ]);
    const apres = partsDeMarche(seg, [
      offreStandard(A, 1200),
      offreStandard(B, 1500),
    ]);
    expect(apres.parts[A]!).toBeGreaterThan(avant.parts[A]!);
    expect(apres.parts[B]!).toBeLessThan(avant.parts[B]!);
  });

  it("une baisse de prix en entrée pèse plus qu'en haut de gamme", () => {
    const segE = segmentEntree();
    const segH = segmentHaut();
    const avantE = partsDeMarche(segE, [offreStandard(A, 1500), offreStandard(B, 1500)]);
    const apresE = partsDeMarche(segE, [offreStandard(A, 1200), offreStandard(B, 1500)]);
    const avantH = partsDeMarche(segH, [offreStandard(A, 15000), offreStandard(B, 15000)]);
    const apresH = partsDeMarche(segH, [offreStandard(A, 12000), offreStandard(B, 15000)]);
    const gainE = apresE.parts[A]! - avantE.parts[A]!;
    const gainH = apresH.parts[A]! - avantH.parts[A]!;
    expect(gainE).toBeGreaterThan(gainH);
  });

  it("bornes réalistes : baisse de 20 % ne crée pas un monopole", () => {
    const seg = segmentEntree();
    const r = partsDeMarche(seg, [
      offreStandard(A, 1200),
      offreStandard(B, 1500),
      offreStandard(C, 1500),
    ]);
    expect(r.parts[A]!).toBeLessThan(0.75);
    expect(r.partFrange).toBeGreaterThan(0.05);
  });

  it("marché avec 2 firmes moyennes : la frange garde une part significative", () => {
    const seg = segmentEntree();
    const r = partsDeMarche(seg, [offreStandard(A), offreStandard(B)]);
    expect(r.partFrange).toBeGreaterThan(0.2);
    expect(r.partFrange).toBeLessThan(0.95);
  });
});

describe("effets des autres variables", () => {
  it("meilleure notoriété → plus grande part", () => {
    const seg = segmentEntree();
    const r = partsDeMarche(seg, [
      offreStandard(A, 1500, { notoriete: 80 }),
      offreStandard(B, 1500, { notoriete: 30 }),
    ]);
    expect(r.parts[A]!).toBeGreaterThan(r.parts[B]!);
  });

  it("meilleure désirabilité pèse davantage en haut de gamme qu'en entrée", () => {
    const segE = segmentEntree();
    const segH = segmentHaut();
    const partE = partsDeMarche(segE, [
      offreStandard(A, 1500, { desirabilite: 80 }),
      offreStandard(B, 1500, { desirabilite: 40 }),
    ]);
    const partH = partsDeMarche(segH, [
      offreStandard(A, 15000, { desirabilite: 80 }),
      offreStandard(B, 15000, { desirabilite: 40 }),
    ]);
    const ecartE = partE.parts[A]! - partE.parts[B]!;
    const ecartH = partH.parts[A]! - partH.parts[B]!;
    expect(ecartH).toBeGreaterThan(ecartE);
  });

  it("présence revendeur plus large → part plus grande", () => {
    const seg = segmentEntree();
    const r = partsDeMarche(seg, [
      offreStandard(A, 1500, { presenceRevendeur: 0.9 }),
      offreStandard(B, 1500, { presenceRevendeur: 0.1 }),
    ]);
    expect(r.parts[A]!).toBeGreaterThan(r.parts[B]!);
  });
});

describe("robustesse", () => {
  it("accepte une liste vide d'offres (frange prend tout)", () => {
    const seg = segmentEntree();
    const r = partsDeMarche(seg, []);
    expect(r.partFrange).toBeCloseTo(1, 10);
  });

  it("refuse un prix nul ou négatif", () => {
    const seg = segmentEntree();
    expect(() =>
      partsDeMarche(seg, [offreStandard(A, 0)]),
    ).toThrow(/positifs/);
  });
});
