import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { coutRevientEstime } from "./coutRevientEstime.js";

const params = chargerParametresV1();

describe("coutRevientEstime", () => {
  it("retourne la somme matiere + fournitures + facon", () => {
    // T-shirt type : 0.8m de jersey a 800 ct/m, fournitures 60 ct, facon 500 ct
    // matiere = 800 * 0.8 * (1 + 0.15) = 736, + 60 + 500 = 1296
    const c = coutRevientEstime(
      {
        consommationParPiece: 0.8,
        fournituresParPieceCentimes: 60,
        prixMatiereParUniteCentimes: 800,
      },
      params,
    );
    expect(c).toBe(1296);
  });

  it("applique le taux de chute sur la matiere", () => {
    // 1.8m a 1000 ct/m avec 15% chute = 2070, + 120 + 500 = 2690
    const c = coutRevientEstime(
      {
        consommationParPiece: 1.8,
        fournituresParPieceCentimes: 120,
        prixMatiereParUniteCentimes: 1000,
      },
      params,
    );
    expect(c).toBe(2690);
  });

  it("gere un produit sans fournitures", () => {
    const c = coutRevientEstime(
      {
        consommationParPiece: 0.5,
        fournituresParPieceCentimes: 0,
        prixMatiereParUniteCentimes: 500,
      },
      params,
    );
    // 500 * 0.5 * 1.15 = 287.5 arrondi a 288, + 0 + 500 = 788
    expect(c).toBe(788);
  });
});
