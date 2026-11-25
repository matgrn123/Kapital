import { describe, expect, it } from "vitest";
import {
  centimes,
  idEntreprise,
  idProduit,
  moisJeu,
  type EcritureComptable,
  type Entreprise,
} from "@kapital/engine";
import { verifierGardeFouMonetaire } from "./gardeFou.js";

const M0 = moisJeu(0);

const apport: EcritureComptable = {
  id: "apport",
  mois: M0,
  libelle: "Apport",
  lignes: [
    { compte: "512", sens: "debit", montant: centimes(2_000_000) },
    { compte: "101", sens: "credit", montant: centimes(2_000_000) },
  ],
};

function entreprise(partiel: Partial<Entreprise> = {}): Entreprise {
  return {
    id: idEntreprise("e"),
    nom: "Test",
    gamme: "entree",
    etape: 0,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(2_000_000),
    stocksMatiere: [],
    stocksFinis: [],
    salaries: [],
    ateliers: [],
    marque: { notoriete: 0, desirabilite: 0 },
    prets: [],
    catalogue: [],
    ...partiel,
  };
}

describe("garde-fou monétaire (3D-9)", () => {
  it("un apport de capital en banque : aucune anomalie", () => {
    expect(
      verifierGardeFouMonetaire({
        ecrituresAvant: [],
        ecrituresPeriode: [apport],
        entrepriseAvant: null,
        entrepriseApres: entreprise(),
      }),
    ).toEqual([]);
  });

  it("une vente avec son coût : la variation des capitaux propres égale le résultat", () => {
    const achat: EcritureComptable = {
      id: "achat",
      mois: M0,
      libelle: "Pièces",
      lignes: [
        { compte: "35", sens: "debit", montant: centimes(1000) },
        { compte: "512", sens: "credit", montant: centimes(1000) },
      ],
    };
    const vente: EcritureComptable = {
      id: "vente",
      mois: moisJeu(1),
      libelle: "Vente",
      lignes: [
        { compte: "512", sens: "debit", montant: centimes(3000) },
        { compte: "707", sens: "credit", montant: centimes(2500) },
        { compte: "44571", sens: "credit", montant: centimes(500) },
        { compte: "7135", sens: "debit", montant: centimes(1000) },
        { compte: "35", sens: "credit", montant: centimes(1000) },
      ],
    };
    const avant = entreprise({
      tresorerie: centimes(1_999_000),
      stocksFinis: [{ produit: idProduit("p"), quantite: 1, valeurTotale: centimes(1000) }],
    });
    expect(
      verifierGardeFouMonetaire({
        ecrituresAvant: [apport, achat],
        ecrituresPeriode: [vente],
        entrepriseAvant: avant,
        entrepriseApres: entreprise({
          tresorerie: centimes(2_002_000),
          stocksFinis: [{ produit: idProduit("p"), quantite: 0, valeurTotale: centimes(0) }],
        }),
      }),
    ).toEqual([]);
  });

  it("de l'argent en trésorerie sans écriture : anomalie", () => {
    const a = verifierGardeFouMonetaire({
      ecrituresAvant: [],
      ecrituresPeriode: [apport],
      entrepriseAvant: null,
      entrepriseApres: entreprise({ tresorerie: centimes(2_000_100) }),
    });
    expect(a.map((x) => x.code)).toEqual([
      "tresorerie_differente_de_la_banque",
      "variation_tresorerie_sans_mouvement",
    ]);
    expect(a[0]).toMatchObject({ attendu: 2_000_000, obtenu: 2_000_100 });
  });

  it("un stock de produits finis sans écriture au 35 : anomalie", () => {
    const a = verifierGardeFouMonetaire({
      ecrituresAvant: [],
      ecrituresPeriode: [apport],
      entrepriseAvant: null,
      entrepriseApres: entreprise({
        stocksFinis: [{ produit: idProduit("p"), quantite: 10, valeurTotale: centimes(5000) }],
      }),
    });
    expect(a.map((x) => x.code)).toEqual(["stock_fini_sans_ecriture"]);
  });

  it("un prêt ou un dépôt sans écriture : anomalie", () => {
    const a = verifierGardeFouMonetaire({
      ecrituresAvant: [],
      ecrituresPeriode: [apport],
      entrepriseAvant: null,
      entrepriseApres: entreprise({
        prets: [
          {
            id: "p1" as never,
            objet: "tresorerie",
            capitalInitial: centimes(100),
            capitalRestant: centimes(100),
            tauxAnnuel: 0.05,
            dureeTotaleMois: 12,
            moisDebut: M0,
          },
        ],
      }),
    });
    expect(a.map((x) => x.code)).toEqual(["pret_sans_ecriture"]);
  });

  it("une écriture déséquilibrée : anomalie, sans lever d'erreur", () => {
    const a = verifierGardeFouMonetaire({
      ecrituresAvant: [],
      ecrituresPeriode: [
        { ...apport, lignes: [apport.lignes[0]!, { compte: "101", sens: "credit", montant: centimes(1) }] },
      ],
      entrepriseAvant: null,
      entrepriseApres: entreprise(),
    });
    expect(a.map((x) => x.code)).toEqual(["ecriture_invalide"]);
  });

  it("un mouvement de banque contre la banque : pas de contrepartie", () => {
    const a = verifierGardeFouMonetaire({
      ecrituresAvant: [apport],
      ecrituresPeriode: [
        {
          id: "boucle",
          mois: M0,
          libelle: "Boucle",
          lignes: [
            { compte: "512", sens: "debit", montant: centimes(10) },
            { compte: "512", sens: "credit", montant: centimes(10) },
          ],
        },
      ],
      entrepriseAvant: entreprise(),
      entrepriseApres: entreprise(),
    });
    expect(a.map((x) => x.code)).toEqual(["banque_sans_contrepartie"]);
  });
});
