import { centimes, idEntreprise, type Entreprise } from "@kapital/engine";
import { describe, expect, it } from "vitest";
import { chargeUtileDepuisLot } from "./stockageSupabase.js";

function entreprise(o: Partial<Entreprise>): Entreprise {
  return {
    id: idEntreprise("e"),
    nom: "E",
    gamme: "milieu",
    etape: 0,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(0),
    stocksMatiere: [],
    stocksFinis: [],
    salaries: [],
    atelier: null,
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [],
    catalogue: [],
    ...o,
  };
}

const lot = (e: Entreprise) => ({
  ecritures: [],
  entreprise: e,
  moisDecouvertConsecutifs: null,
  echeancesPayees: [],
  commandesMatiereLivrees: [],
  ordresFaconnierLivres: [],
  cumul: null,
});

describe("charge utile du pas : étape et compteurs (migration 0025)", () => {
  it("envoie l'étape et les compteurs cumulés à la fonction Postgres", () => {
    const p = chargeUtileDepuisLot(
      lot(entreprise({ etape: 1, cumulsEtape: { piecesVendues: 64, chiffreAffairesHt: centimes(180_000) } })),
    );
    expect(p.entreprise).toMatchObject({
      etape: 1,
      pieces_vendues_total: 64,
      chiffre_affaires_cumule_ht_centimes: 180_000,
    });
  });

  it("sans compteurs, envoie zéro (entreprise d'avant AE-2)", () => {
    const p = chargeUtileDepuisLot(lot(entreprise({})));
    expect(p.entreprise).toMatchObject({ etape: 0, pieces_vendues_total: 0, chiffre_affaires_cumule_ht_centimes: 0 });
  });
});
