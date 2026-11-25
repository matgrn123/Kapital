import { chargerBatimentsV1, chargerParametresV1 } from "@kapital/content";
import {
  centimes,
  idEntreprise,
  moisJeu,
  nouveauPointDeVente,
  passantsReferenceBoutiques,
  type Entreprise,
} from "@kapital/engine";
import { describe, expect, it } from "vitest";
import { validerDecision } from "./validerDecision.js";
import { MESSAGE_SANS_BOUTIQUE } from "./validations/embauche.js";

const PARAMS = chargerParametresV1();
const BATIMENTS = chargerBatimentsV1();

function entreprise(o: Partial<Entreprise> = {}): Entreprise {
  return {
    id: idEntreprise("ent_vendeur"),
    nom: "Test",
    gamme: "milieu",
    etape: 2,
    proprietaire: { type: "joueur", idProfil: "p" },
    statut: "active",
    tresorerie: centimes(2_000_000),
    stocksMatiere: [],
    stocksFinis: [],
    salaries: [],
    atelier: null,
    marque: { notoriete: 40, desirabilite: 40 },
    prets: [],
    catalogue: [],
    ...o,
  };
}

const boutique = nouveauPointDeVente({
  id: "pdv_1",
  batiment: BATIMENTS.find((b) => b.id === "boutique_quartier_createurs")!,
  mois: moisJeu(3),
  params: PARAMS,
  passantsReference: passantsReferenceBoutiques(BATIMENTS),
});

const vendeur = {
  type: "embauche",
  poste: "vendeur",
  salaireBrutMensuel: centimes(PARAMS["vendeur_salaire_brut_mensuel_centimes"]!.valeur),
} as const;

describe("AE-10 : embauche d'un vendeur", () => {
  it("refusée sans boutique, avec un message clair", () => {
    const r = validerDecision({ entreprise: entreprise() }, vendeur);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("sans_boutique");
      expect(r.message).toBe(MESSAGE_SANS_BOUTIQUE);
    }
  });

  it("acceptée avec une boutique en travaux ou ouverte, même sans atelier ni poste libre", () => {
    expect(validerDecision({ entreprise: entreprise({ pointsDeVente: [boutique] }) }, vendeur).ok).toBe(true);
  });

  it("reste soumise à la réserve de trésorerie", () => {
    const r = validerDecision({ entreprise: entreprise({ pointsDeVente: [boutique], tresorerie: centimes(0) }) }, vendeur);
    expect(r.ok).toBe(false);
  });
});
