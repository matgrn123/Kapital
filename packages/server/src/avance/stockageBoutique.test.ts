import { chargerBatimentsV1 } from "@kapital/content";
import { centimes, idEntreprise, moisJeu, passantsReferenceBoutiques, type Entreprise } from "@kapital/engine";
import { describe, expect, it } from "vitest";
import { chargeUtileDepuisLot, fonctionDePas, pointsDeVenteDepuisLignes } from "./stockageSupabase.js";
import type { ResultatLotAEnregistrer } from "./port.js";

const BATIMENTS = chargerBatimentsV1();

const LIGNE = {
  id: "pdv-uuid",
  batiment_id: "boutique_rue_commercante",
  surface_m2: 60,
  loyer_mensuel_centimes: 300_000,
  charges_mensuelles_centimes: 15_000,
  depot_garantie_centimes: 900_000,
  travaux_centimes: 3_000_000,
  duree_amortissement_mois: 120,
  mois_signature: 5,
  mois_ouverture: 6,
  stock_boutique: [{ product_id: "prod_tshirt", quantite_pieces: 40, valeur_totale_centimes: 80_000 }],
};

describe("AE-10 : chargerEtat lit les boutiques", () => {
  it("une ligne points_de_vente devient un point de vente du moteur (catalogue, amortissements, stock)", () => {
    const [pdv] = pointsDeVenteDepuisLignes(
      [LIGNE],
      [
        { ecriture_id: "boutique_amort_6_pdv-uuid", sens: "credit", montant_centimes: 25_000 },
        { ecriture_id: "boutique_amort_7_pdv-uuid", sens: "credit", montant_centimes: 25_000 },
        { ecriture_id: "boutique_amort_7_autre", sens: "credit", montant_centimes: 99_999 },
      ],
      BATIMENTS,
    );
    expect(pdv).toMatchObject({
      id: "pdv-uuid",
      loyerMensuel: 300_000,
      moisOuverture: 6,
      passantsParJour: 10_000,
      passantsReference: passantsReferenceBoutiques(BATIMENTS),
      bonusDesirabiliteParMois: 0.6,
      agencement: { valeurBrute: 3_000_000, amortissementsCumules: 50_000, dureeAmortissementMois: 120 },
      stock: [{ produit: "prod_tshirt", quantite: 40, valeurTotale: 80_000 }],
    });
  });

  it("sans boutique : liste vide", () => {
    expect(pointsDeVenteDepuisLignes(null, [], BATIMENTS)).toEqual([]);
  });
});

function lot(e: Partial<Entreprise>): ResultatLotAEnregistrer {
  const entreprise: Entreprise = {
    id: idEntreprise("e"),
    nom: "E",
    gamme: "milieu",
    etape: 2,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(0),
    stocksMatiere: [],
    stocksFinis: [],
    salaries: [],
    ateliers: [],
    marque: { notoriete: 0, desirabilite: 0 },
    prets: [],
    catalogue: [],
    ...e,
  };
  return {
    entreprise,
    ecritures: [],
    echeancesPayees: [],
    commandesMatiereLivrees: [],
    ordresFaconnierLivres: [],
    moisDecouvertConsecutifs: null,
    cumul: null,
  } as unknown as ResultatLotAEnregistrer;
}

describe("AE-10 : le pas enregistre les stocks des boutiques", () => {
  it("sans boutique : appliquer_pas_entreprise, sans clé stocks_boutique (rien ne change avant 0038)", () => {
    const etat = chargeUtileDepuisLot(lot({}));
    expect(etat.stocks_boutique).toBeUndefined();
    expect(fonctionDePas(etat)).toBe("appliquer_pas_entreprise");
  });

  it("avec boutique : appliquer_pas_boutique et le stock de chaque boutique", () => {
    const [pdv] = pointsDeVenteDepuisLignes([LIGNE], [], BATIMENTS);
    const etat = chargeUtileDepuisLot(lot({ pointsDeVente: [{ ...pdv!, moisSignature: moisJeu(5) }] }));
    expect(fonctionDePas(etat)).toBe("appliquer_pas_boutique");
    expect(etat.stocks_boutique).toEqual([
      { point_de_vente_id: "pdv-uuid", product_id: "prod_tshirt", quantite_pieces: 40, valeur_totale_centimes: 80_000 },
    ]);
  });
});
