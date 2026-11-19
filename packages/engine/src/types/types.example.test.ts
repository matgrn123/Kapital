import { describe, expect, it } from "vitest";
import type {
  Decision,
  DecisionsEntreprise,
  Entreprise,
  MarketInputs,
  Monde,
  Produit,
} from "./index.js";
import {
  centimes,
  graine,
  idEntreprise,
  idFournisseur,
  idMatiere,
  idProduit,
  idSalarie,
  minutes,
  moisJeu,
} from "./index.js";

describe("types du moteur", () => {
  it("construit un produit de référence (t-shirt)", () => {
    const tshirt: Produit = {
      id: idProduit("prod_tshirt_basique"),
      type: "t_shirt",
      nom: "T-shirt basique",
      matiere: idMatiere("mat_jersey_coton"),
      consommationParPiece: 0.8,
      fournituresParPiece: centimes(60),
      tempsStandard: minutes(25),
    };
    expect(tshirt.type).toBe("t_shirt");
    expect(tshirt.tempsStandard).toBe(25);
  });

  it("construit une entreprise minimale avec un salarié", () => {
    const entreprise: Entreprise = {
      id: idEntreprise("ent_marque_1"),
      nom: "Ma Marque",
      gamme: "milieu",
      etape: 0,
      proprietaire: { type: "joueur", idProfil: "profil_mathieu" },
      statut: "active",
      tresorerie: centimes(2_000_000),
      stocksMatiere: [],
      stocksFinis: [],
      salaries: [
        {
          id: idSalarie("sal_1"),
          poste: "artisan",
          salaireBrutMensuel: centimes(186702),
          ancienneteMois: 0,
          experienceMois: 0,
        },
      ],
      atelier: {
        surfaceM2: 50,
        loyerMensuel: centimes(100_000),
        nombreMachines: 2,
      },
      marque: { notoriete: 0, desirabilite: 0 },
      prets: [],
      catalogue: [],
    };
    expect(entreprise.salaries).toHaveLength(1);
    expect(entreprise.tresorerie).toBe(2_000_000);
  });

  it("construit un monde contenant une entreprise", () => {
    const monde: Monde = {
      moisCourant: moisJeu(0),
      entreprises: [
        {
          id: idEntreprise("ent_1"),
          nom: "Test",
          gamme: "entree",
          etape: 0,
          proprietaire: { type: "pnj" },
          statut: "active",
          tresorerie: centimes(500_000),
          stocksMatiere: [],
          stocksFinis: [],
          salaries: [],
          atelier: null,
          marque: { notoriete: 10, desirabilite: 5 },
          prets: [],
          catalogue: [],
        },
      ],
      prixMatieres: [
        { matiere: idMatiere("mat_jersey_coton"), prixParUnite: centimes(500) },
      ],
      franges: [
        { segment: "entree", partDeMarche: 0.5, prixMoyen: centimes(1500) },
      ],
      evenements: [],
    };
    expect(monde.entreprises).toHaveLength(1);
    expect(monde.moisCourant).toBe(0);
  });

  it("construit une décision (changer un prix)", () => {
    const d: Decision = {
      type: "changer_prix",
      produit: idProduit("prod_tshirt"),
      canal: "vente_directe",
      prix: centimes(2999),
    };
    expect(d.type).toBe("changer_prix");
  });

  it("regroupe plusieurs décisions pour une entreprise", () => {
    const paquet: DecisionsEntreprise = {
      entreprise: idEntreprise("ent_1"),
      decisions: [
        {
          type: "commander_matiere",
          matiere: idMatiere("mat_jersey"),
          quantite: 100,
          fournisseur: idFournisseur("four_1"),
        },
        {
          type: "action_marketing",
          action: "publicite",
          montant: centimes(50_000),
        },
      ],
    };
    expect(paquet.decisions).toHaveLength(2);
  });

  it("construit les données de marché du mois", () => {
    const m: MarketInputs = {
      mois: moisJeu(3),
      smicHoraireBrut: centimes(1231),
      tauxEstrAnnuel: 0.035,
      prixElectriciteParKwh: centimes(16),
      coursCotonParKg: centimes(180),
      inflationMensuelle: 0.002,
    };
    expect(m.mois).toBe(3);
  });

  it("centimes refuse un montant non entier", () => {
    expect(() => centimes(12.5)).toThrow(/entier/);
  });

  it("minutes refuse une valeur négative", () => {
    expect(() => minutes(-1)).toThrow(/positif/);
  });

  it("moisJeu refuse un entier négatif", () => {
    expect(() => moisJeu(-1)).toThrow(/>= 0/);
  });

  it("graine accepte zéro", () => {
    expect(graine(0)).toBe(0);
  });
});
