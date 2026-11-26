import { chargerParametresV1 } from "@kapital/content";
import {
  centimes,
  configTempsDepuis,
  cumulVide,
  idEntreprise,
  idProduit,
  moisJeu,
  type Entreprise,
} from "@kapital/engine";
import { describe, expect, it } from "vitest";
import type { EtatChargeEntreprise } from "../avance/port.js";
import {
  construireGrandLivre,
  lireIndicateursEntreprise,
  type LigneLedger,
} from "./indicateurs.js";

const PARAMS = chargerParametresV1();
const TSHIRT = idProduit("prod_tshirt");

const ENTREPRISE: Entreprise = {
  id: idEntreprise("e1"),
  nom: "Test",
  gamme: "milieu",
  etape: 2,
  proprietaire: { type: "pnj" },
  statut: "active",
  tresorerie: centimes(1_000_000),
  stocksMatiere: [],
  stocksFinis: [{ produit: TSHIRT, quantite: 50, valeurTotale: centimes(100_000) }],
  salaries: [],
  ateliers: [],
  marque: { notoriete: 0, desirabilite: 0 },
  prets: [],
  catalogue: [
    {
      produit: TSHIRT,
      qualiteVisee: 60,
      // Prix revendeur saisi hors taxes : 30 € HT.
      prix: { vente_directe: centimes(6000), revendeur: centimes(3000) },
      productionMensuelleCible: 100,
    },
  ],
};

function ligne(ecriture: string, mois: number, compte: string, sens: "debit" | "credit", montant: number): LigneLedger {
  return { ecriture_id: ecriture, mois_jeu: mois, libelle: ecriture, compte, sens, montant_centimes: montant };
}

const LIGNES: LigneLedger[] = [
  ligne("apport", 0, "512", "debit", 1_000_000),
  ligne("apport", 0, "101", "credit", 1_000_000),
  ligne("vente", 1, "411", "debit", 60_000),
  ligne("vente", 1, "707", "credit", 60_000),
  ligne("vente", 1, "7135", "debit", 40_000),
  ligne("vente", 1, "35", "credit", 40_000),
];

describe("construireGrandLivre", () => {
  it("regroupe les lignes par écriture et garde l'équilibre", () => {
    const gl = construireGrandLivre(LIGNES);
    expect(gl.ecritures).toHaveLength(2);
    expect(gl.ecritures[1]!.lignes).toHaveLength(4);
  });

  it("refuse une écriture déséquilibrée en base", () => {
    expect(() => construireGrandLivre([ligne("x", 0, "512", "debit", 10), ligne("x", 0, "101", "credit", 5)])).toThrow();
  });
});

describe("lireIndicateursEntreprise", () => {
  it("lit l'état, les écritures et rend les indicateurs", async () => {
    const pasParMois = configTempsDepuis(PARAMS).pasParMois;
    const cumul = {
      ...cumulVide(moisJeu(2), centimes(0)),
      pasTraites: pasParMois / 2,
      serviParLigne: { "prod_tshirt|revendeur": 10 },
    };
    const etat: EtatChargeEntreprise = { entreprise: ENTREPRISE, cumul };
    const r = await lireIndicateursEntreprise(
      {
        chargerEtat: async (id, mois) => {
          expect(id).toBe("e1");
          expect(mois).toBe(2);
          return etat;
        },
        chargerLignesGrandLivre: async () => LIGNES,
      },
      PARAMS,
      { companyId: "e1", moisCourant: 2 },
    );
    // 10 pièces à mi-mois -> 20 par mois, 30 € HT chacune
    expect(r.marges.parCanal.revendeur.pieces).toBe(20);
    expect(r.marges.parCanal.revendeur.chiffreAffairesHt).toBe(60_000);
    expect(r.besoinEnFondsDeRoulement.creances).toBe(60_000);
    expect(r.previsionnel.tresorerieDepart).toBe(1_000_000);
  });
});
