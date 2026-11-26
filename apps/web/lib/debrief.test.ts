import type { DetailCloture } from "@kapital/server";
import { describe, expect, it } from "vitest";
import { debriefDuMois, plusGrosPaiement } from "./debrief";
import { formaterEuros } from "./formatage";

const eur = (c: number) => `${formaterEuros(c)} €`;

const SANS_PAIEMENT = { paie: 0, loyers: 0, echeances: 0, tva: 0, impot: 0, agios: 0, energie: 0, autres: 0 };

function cloture(s: Partial<DetailCloture> = {}): DetailCloture {
  return {
    mois: 4,
    tresorerieDebut: 1_000_000,
    tresorerieFin: 1_200_000,
    chiffreAffairesHt: 500_000,
    produits: 500_000,
    charges: 300_000,
    resultat: 200_000,
    paiements: { ...SANS_PAIEMENT, paie: 186_702, loyers: 250_000 },
    totalPaye: 436_702,
    piecesNonLivrees: 0,
    ventesPerdues: [],
    explications: [],
    etapeAvant: 1,
    etapeApres: 1,
    moisDecouvertConsecutifs: 0,
    ...s,
  };
}

describe("debriefDuMois : trois phrases", () => {
  it("un bon mois : ventes, bénéfice, et une idée pour réinvestir", () => {
    const d = debriefDuMois(cloture());
    expect(d.quoi).toBe(`Au mois 4, tu as vendu pour ${eur(500_000)} HT et ta trésorerie est passée de ${eur(1_000_000)} à ${eur(1_200_000)}.`);
    expect(d.pourquoi).toContain(`bénéfice de ${eur(200_000)}`);
    expect(d.essayer).toContain("Réinvestis");
    expect(d.lien.href).toBe("/marketing");
  });

  it("des ventes perdues : la rupture est la cause, la production le remède", () => {
    const d = debriefDuMois(
      cloture({
        piecesNonLivrees: 30,
        ventesPerdues: [
          { produit: "prod_sac_toile", manquantes: 5 },
          { produit: "prod_tshirt", manquantes: 25 },
        ],
      }),
      { prod_tshirt: "T-shirt basique" },
    );
    expect(d.pourquoi).toBe("Tu as manqué 30 ventes faute de stock, surtout en t-shirt basique.");
    expect(d.lien.href).toBe("/atelier");
  });

  it("un mois à perte : les charges et le plus gros paiement", () => {
    const d = debriefDuMois(cloture({ produits: 100_000, charges: 450_000, resultat: -350_000, chiffreAffairesHt: 100_000 }));
    expect(d.pourquoi).toBe(
      `Tes charges (${eur(450_000)}) ont dépassé tes produits (${eur(100_000)}) ; le plus gros paiement du mois est les loyers (${eur(250_000)}).`,
    );
    expect(d.lien.href).toBe("/produits");
  });

  it("à découvert : trouver de la trésorerie passe avant tout", () => {
    const d = debriefDuMois(cloture({ tresorerieFin: -5_000, piecesNonLivrees: 3, ventesPerdues: [{ produit: "x", manquantes: 3 }] }));
    expect(d.essayer).toContain("trésorerie");
    expect(d.lien.href).toBe("/banque");
  });

  it("aucune vente : le dire, et vérifier la mise en vente", () => {
    const d = debriefDuMois(cloture({ chiffreAffairesHt: 0, produits: 0, charges: 436_702, resultat: -436_702 }));
    expect(d.quoi).toMatch(/^Au mois 4, tu n'as rien vendu/);
    expect(d.lien.href).toBe("/produits");
    expect(d.essayer).toContain("en vente");
  });

  it("une étape franchie est signalée quand tout va bien", () => {
    const d = debriefDuMois(cloture({ etapeAvant: 1, etapeApres: 2 }));
    expect(d.essayer).toContain("étape 2");
  });
});

describe("plusGrosPaiement", () => {
  it("rend le poste le plus lourd, ou null", () => {
    expect(plusGrosPaiement({ ...SANS_PAIEMENT, paie: 10, tva: 30 })).toEqual({ nom: "la TVA", montant: 30 });
    expect(plusGrosPaiement(SANS_PAIEMENT)).toBeNull();
  });
});
