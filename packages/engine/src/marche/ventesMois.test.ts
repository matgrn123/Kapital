import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import type { Entreprise, ProduitEntreprise } from "../types/entreprise.js";
import type { Monde } from "../types/monde.js";
import {
  centimes,
  idEntreprise,
  idProduit,
  moisJeu,
} from "../types/primitifs.js";
import { calculerVentesMois } from "./ventesMois.js";

const params = chargerParametresV1();

function produit(prixDirecte: number, prixRevendeur: number): ProduitEntreprise {
  return {
    produit: idProduit("tshirt"),
    qualiteVisee: 60,
    prix: {
      vente_directe: centimes(prixDirecte),
      revendeur: centimes(prixRevendeur),
    },
    productionMensuelleCible: 100,
  };
}

function entrepriseMilieu(
  nom: string,
  noto: number,
  desi: number,
  prod: ProduitEntreprise,
): Entreprise {
  return {
    id: idEntreprise(`ent_${nom}`),
    nom,
    gamme: "milieu",
    etape: 0,
    proprietaire: { type: "joueur", idProfil: `p_${nom}` },
    statut: "active",
    tresorerie: centimes(2_000_000),
    stocksMatiere: [],
    stocksFinis: [],
    salaries: [],
    atelier: null,
    marque: { notoriete: noto, desirabilite: desi },
    prets: [],
    catalogue: [prod],
  };
}

function monde(entreprises: readonly Entreprise[]): Monde {
  return {
    moisCourant: moisJeu(0),
    entreprises,
    prixMatieres: [],
    franges: [],
    evenements: [],
  };
}

describe("calculerVentesMois", () => {
  it("retourne aucune vente sur une durée nulle", () => {
    const m = monde([entrepriseMilieu("A", 50, 50, produit(6000, 3000))]);
    const v = calculerVentesMois(m, 0, params);
    expect(v).toEqual([]);
  });

  it("retourne aucune vente si le catalogue est vide", () => {
    const e: Entreprise = {
      ...entrepriseMilieu("A", 50, 50, produit(6000, 3000)),
      catalogue: [],
    };
    const v = calculerVentesMois(monde([e]), 1, params);
    expect(v).toEqual([]);
  });

  it("ignore les entreprises liquidees", () => {
    const e: Entreprise = {
      ...entrepriseMilieu("A", 50, 50, produit(6000, 3000)),
      statut: "liquidee",
    };
    const v = calculerVentesMois(monde([e]), 1, params);
    expect(v).toEqual([]);
  });

  it("genere des ventes positives pour une entreprise active avec produit en catalogue", () => {
    const m = monde([entrepriseMilieu("A", 60, 60, produit(6000, 3000))]);
    const v = calculerVentesMois(m, 1, params);
    expect(v.length).toBeGreaterThan(0);
    for (const vente of v) {
      expect(vente.quantite).toBeGreaterThan(0);
      expect(vente.entreprise).toBe(idEntreprise("ent_A"));
    }
  });

  it("une entreprise avec meilleure notoriete capte plus de ventes qu'une concurrente plus faible", () => {
    const m = monde([
      entrepriseMilieu("Fort", 80, 80, produit(6000, 3000)),
      entrepriseMilieu("Faible", 20, 20, produit(6000, 3000)),
    ]);
    const v = calculerVentesMois(m, 1, params);
    const fort = v
      .filter((x) => x.entreprise === idEntreprise("ent_Fort"))
      .reduce((s, x) => s + x.quantite, 0);
    const faible = v
      .filter((x) => x.entreprise === idEntreprise("ent_Faible"))
      .reduce((s, x) => s + x.quantite, 0);
    expect(fort).toBeGreaterThan(faible);
  });

  it("une entreprise avec prix plus bas capte plus de ventes (toutes choses egales par ailleurs)", () => {
    const m = monde([
      entrepriseMilieu("Pas cher", 50, 50, produit(4000, 2000)),
      entrepriseMilieu("Cher", 50, 50, produit(8000, 4000)),
    ]);
    const v = calculerVentesMois(m, 1, params);
    const pasCher = v
      .filter((x) => x.entreprise === idEntreprise("ent_Pas cher"))
      .reduce((s, x) => s + x.quantite, 0);
    const cher = v
      .filter((x) => x.entreprise === idEntreprise("ent_Cher"))
      .reduce((s, x) => s + x.quantite, 0);
    expect(pasCher).toBeGreaterThan(cher);
  });

  it("volume de ventes proportionnel a la duree ecoulee", () => {
    const m = monde([entrepriseMilieu("A", 60, 60, produit(6000, 3000))]);
    const v1 = calculerVentesMois(m, 1, params);
    const v2 = calculerVentesMois(m, 2, params);
    const total1 = v1.reduce((s, x) => s + x.quantite, 0);
    const total2 = v2.reduce((s, x) => s + x.quantite, 0);
    // tolerance aux arrondis
    expect(total2).toBeGreaterThanOrEqual(total1 * 1.9);
    expect(total2).toBeLessThanOrEqual(total1 * 2.1);
  });
});
