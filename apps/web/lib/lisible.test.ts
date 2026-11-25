import { describe, it, expect } from "vitest";
import { libelleGamme, libelleLisible, nomMatiere } from "./lisible";

describe("libelleLisible", () => {
  const noms = { prod_tshirt: "T-shirt basique", prod_sac: "Sac en toile" };

  it("remplace l'identifiant technique d'un produit par son nom", () => {
    expect(libelleLisible("Vente directe 110 prod_tshirt", noms)).toBe(
      "Vente directe 110 T-shirt basique",
    );
  });

  it("remplace tous les identifiants présents", () => {
    expect(libelleLisible("prod_sac puis prod_tshirt ×10", noms)).toBe(
      "Sac en toile puis T-shirt basique ×10",
    );
  });

  it("laisse un identifiant inconnu tel quel", () => {
    expect(libelleLisible("Retour 3 prod_inconnu", noms)).toBe("Retour 3 prod_inconnu");
  });

  it("ne touche pas un libellé sans identifiant", () => {
    expect(libelleLisible("Loyer de l'atelier", noms)).toBe("Loyer de l'atelier");
  });
});

describe("libelleGamme", () => {
  it("écrit les gammes en français correct", () => {
    expect(libelleGamme("entree")).toBe("Entrée de gamme");
    expect(libelleGamme("milieu")).toBe("Milieu de gamme");
    expect(libelleGamme("haut")).toBe("Haut de gamme");
  });

  it("rend une gamme inconnue telle quelle", () => {
    expect(libelleGamme("autre")).toBe("autre");
  });
});

describe("nomMatiere", () => {
  it("utilise le nom du catalogue quand il existe", () => {
    expect(nomMatiere("mat_jersey_coton", { mat_jersey_coton: "Jersey de coton bio" })).toBe(
      "jersey de coton bio",
    );
  });

  it("à défaut, rend l'identifiant lisible", () => {
    expect(nomMatiere("mat_toile_coton", {})).toBe("toile coton");
  });
});
