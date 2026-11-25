import { describe, expect, it } from "vitest";
import {
  boiteEnglobante,
  caseSousPoint,
  cleProfondeur,
  coinsPave,
  faceDroite,
  faceGauche,
  iso,
  nuance,
  points,
  quad,
  teintesFaces,
  trierProfondeur,
  TW,
  TH,
  TZ,
} from "./geometrie";

describe("projection isométrique", () => {
  it("place l'origine en 0,0", () => {
    expect(iso(0, 0, 0)).toEqual([0, 0]);
  });
  it("respecte le rapport 2:1", () => {
    expect(iso(1, 0)).toEqual([TW / 2, TH / 2]);
    expect(iso(0, 1)).toEqual([-TW / 2, TH / 2]);
    expect(TW / TH).toBe(2);
  });
  it("monte de TZ pixels par étage", () => {
    expect(iso(0, 0, 1)).toEqual([0, -TZ]);
  });
  it("produit un attribut points arrondi", () => {
    expect(points([[0, 0], [1, 0, 0], [1, 1, 1]])).toBe("0,0 32,16 0,0");
  });
  it("inverse la projection pour retrouver la case", () => {
    const [px, py] = iso(3.5, 2.5);
    expect(caseSousPoint(px, py)).toEqual([3, 2]);
  });
});

describe("faces", () => {
  it("paramètre les faces gauche et droite", () => {
    expect(faceGauche(1, 2)(0.5, 1)).toEqual([1.5, 2, 1]);
    expect(faceDroite(1, 2)(0.5, 1)).toEqual([1, 2.5, 1]);
    expect(quad(faceGauche(0, 0), 0, 1, 0, 1)).toHaveLength(4);
  });
});

describe("lumière", () => {
  it("nuance une couleur", () => {
    expect(nuance("#808080", 0.5)).toBe("#404040");
    expect(nuance("#000000", 2)).toBe("#ffffff");
    expect(nuance("#123456", 1)).toBe("#123456");
  });
  it("éclaire la face gauche plus que la droite, le dessus le plus", () => {
    const t = teintesFaces("#a0a0a0");
    const v = (h: string) => parseInt(h.slice(1, 3), 16);
    expect(v(t.dessus)).toBeGreaterThan(v(t.gauche));
    expect(v(t.gauche)).toBeGreaterThan(v(t.droite));
  });
});

describe("tri par profondeur", () => {
  it("utilise la clé x+y+w+d", () => {
    expect(cleProfondeur({ x: 1, y: 2, w: 3, d: 4 })).toBe(10);
    expect(cleProfondeur({ x: 1, y: 2 })).toBe(3);
  });
  it("dessine le fond d'abord, sans muter, stable", () => {
    const l = [
      { id: "devant", x: 5, y: 5 },
      { id: "fond", x: 0, y: 0, w: 1, d: 1 },
      { id: "a", x: 2, y: 2 },
      { id: "b", x: 3, y: 1 },
      { id: "force", x: 9, y: 9, cle: -1 },
    ];
    const t = trierProfondeur(l);
    expect(t.map((o) => o.id)).toEqual(["force", "fond", "a", "b", "devant"]);
    expect(l[0]!.id).toBe("devant");
  });
});

describe("boîte englobante", () => {
  it("encadre un pavé avec sa marge", () => {
    const c = boiteEnglobante(coinsPave(0, 0, 1, 1, 1), 10);
    expect(c.minX).toBe(-TW / 2 - 10);
    expect(c.largeur).toBe(TW + 20);
    expect(c.minY).toBe(-TZ - 10);
    expect(c.hauteur).toBe(TH + TZ + 20);
  });
  it("renvoie un cadre vide sans points", () => {
    expect(boiteEnglobante([]).largeur).toBe(0);
  });
});
