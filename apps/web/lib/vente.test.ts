import { describe, expect, it } from "vitest";
import { besoinFondsRoulementDepuisLignes, bornesPrix, coutRevientEstimeSansStock, coutsProduitAAjouter } from "./vente";

const l = (id: string, compte: string, sens: "debit" | "credit", montant: number) => ({
  ecriture_id: id,
  mois_jeu: 0,
  libelle: "x",
  compte,
  sens,
  montant_centimes: montant,
});

describe("bornesPrix", () => {
  it("part du prix sans perte et va jusqu'au double du plus haut des deux", () => {
    // coût 1000, TVA 20 % : sous 1200 TTC on vend à perte.
    expect(bornesPrix({ coutRevient: 1000, prixActuel: 2000, tauxTva: 0.2 })).toEqual({ min: 1200, max: 4000 });
  });
  it("garde le prix actuel dans les bornes même s'il est sous le coût", () => {
    const b = bornesPrix({ coutRevient: 1000, prixActuel: 900, tauxTva: 0.2 });
    expect(b.min).toBe(900);
    expect(b.max).toBe(2400);
  });
  it("sans coût connu, part de zéro", () => {
    expect(bornesPrix({ coutRevient: null, prixActuel: 1500, tauxTva: 0.2 })).toEqual({ min: 0, max: 3000 });
  });
  it("avec un pas, arrondit les bornes au pas pour que chaque cran tombe sur un prix rond", () => {
    // coût 763, TVA 20 % : plancher 915,6 → 916 ; arrondi au pas de 10 centimes en dessous.
    const b = bornesPrix({ coutRevient: 763, prixActuel: 1993, tauxTva: 0.2, pas: 10 });
    expect(b).toEqual({ min: 910, max: 3990 });
    expect(b.min % 10).toBe(0);
    expect(b.max % 10).toBe(0);
  });
  it("avec un pas, garde le prix actuel dans les bornes", () => {
    const b = bornesPrix({ coutRevient: 1000, prixActuel: 1197, tauxTva: 0.2, pas: 10 });
    expect(b.min).toBeLessThanOrEqual(1197);
    expect(b.max).toBeGreaterThanOrEqual(1197);
    expect(b).toEqual({ min: 1190, max: 2400 });
  });
});

describe("coutsProduitAAjouter", () => {
  const espaces = (t: string | null) => (t ?? "").replace(/\s/g, " ");
  it("premier produit : annonce le coût de la série de lancement, puis le façonnier", () => {
    const c = coutsProduitAAjouter({ serie: { quantite: 100, coutParPiece: 763 }, coutFaconnier: 620 });
    expect(espaces(c.principal)).toBe("Série de lancement : 100 pièces à 7,63 € la pièce");
    expect(espaces(c.ensuite)).toBe("Ensuite dès 6,20 € chez un façonnier");
  });
  it("produits suivants : pas de série, seulement le façonnier", () => {
    const c = coutsProduitAAjouter({ serie: null, coutFaconnier: 620 });
    expect(espaces(c.principal)).toBe("Coût de revient dès 6,20 € la pièce chez un façonnier");
    expect(c.ensuite).toBeNull();
  });
  it("sans façonnier pour ce produit, rien à annoncer après la série", () => {
    const c = coutsProduitAAjouter({ serie: { quantite: 100, coutParPiece: 763 }, coutFaconnier: null });
    expect(c.ensuite).toBeNull();
    expect(coutsProduitAAjouter({ serie: null, coutFaconnier: null })).toEqual({ principal: null, ensuite: null });
  });
});

describe("besoinFondsRoulementDepuisLignes", () => {
  it("additionne stocks et créances, retire les dettes fournisseurs (calcul du moteur)", () => {
    const b = besoinFondsRoulementDepuisLignes([
      l("a", "31", "debit", 50_000),
      l("a", "401", "credit", 50_000),
      l("b", "35", "debit", 20_000),
      l("b", "512", "credit", 20_000),
      l("c", "411", "debit", 12_000),
      l("c", "701", "credit", 12_000),
      l("d", "401", "debit", 10_000),
      l("d", "512", "credit", 10_000),
    ]);
    expect(b).toEqual({ stocks: 70_000, creances: 12_000, dettesFournisseurs: 40_000, besoin: 42_000 });
  });
  it("vaut zéro sans écriture", () => {
    expect(besoinFondsRoulementDepuisLignes([]).besoin).toBe(0);
  });
});

describe("coutRevientEstimeSansStock", () => {
  const tshirt = { consommationParPiece: 0.8, fournituresCentimes: 60 };
  it("compte la matière (chute comprise), les fournitures et la façon, chez le façonnier le moins cher", () => {
    const cout = coutRevientEstimeSansStock({
      produit: tshirt,
      prixMatiereCentimes: [500, 350, 420],
      tauxChute: 0.1,
      faconniers: [
        { prixFaconCentimes: 450, fournitMatiere: false },
        { prixFaconCentimes: 300, fournitMatiere: false },
      ],
    });
    // 3,50 € × 0,8 × 1,1 = 3,08 € de matière + 0,60 € + 3,00 € de façon
    expect(cout).toBe(668);
  });
  it("prend le prix tel quel quand le façonnier fournit la matière", () => {
    expect(
      coutRevientEstimeSansStock({
        produit: tshirt,
        prixMatiereCentimes: [350],
        tauxChute: 0.1,
        faconniers: [{ prixFaconCentimes: 900, fournitMatiere: true }],
      }),
    ).toBe(900);
  });
  it("renvoie null sans façonnier", () => {
    expect(coutRevientEstimeSansStock({ produit: tshirt, prixMatiereCentimes: [350], tauxChute: 0, faconniers: [] })).toBeNull();
  });
});
