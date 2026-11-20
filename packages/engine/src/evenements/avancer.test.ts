import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import {
  enEquilibre,
  planComptableV1,
  soldeCompte,
  type GrandLivre,
} from "../comptabilite/index.js";
import type { Entreprise } from "../types/entreprise.js";
import type { MarketInputs } from "../types/marketInputs.js";
import type { Monde } from "../types/monde.js";
import {
  centimes,
  graine,
  idEntreprise,
  idMatiere,
  idPret,
  instantJeu,
  MINUTES_PAR_MOIS_JEU,
  moisJeu,
  type IdEntreprise,
} from "../types/primitifs.js";
import { avancer } from "./avancer.js";
import type { EtatMonde, EvenementPlanifie } from "./types.js";

const ENT = idEntreprise("ent_A");
const MAT = idMatiere("mat_jersey");

function entrepriseTest(): Entreprise {
  return {
    id: ENT,
    nom: "A",
    gamme: "milieu",
    etape: 0,
    proprietaire: { type: "joueur", idProfil: "profil" },
    statut: "active",
    tresorerie: centimes(2_000_000),
    stocksMatiere: [],
    stocksFinis: [],
    salaries: [],
    atelier: null,
    marque: { notoriete: 40, desirabilite: 40 },
    prets: [
      {
        id: idPret("pret_1"),
        capitalInitial: centimes(1_000_000),
        capitalRestant: centimes(1_000_000),
        tauxAnnuel: 0.05,
        dureeTotaleMois: 12,
        moisDebut: moisJeu(0),
      },
    ],
    catalogue: [],
  };
}

function mondeTest(): Monde {
  return {
    moisCourant: moisJeu(0),
    entreprises: [entrepriseTest()],
    prixMatieres: [],
    franges: [],
    evenements: [],
  };
}

function inputsTest(): MarketInputs {
  return {
    mois: moisJeu(0),
    smicHoraireBrut: centimes(1231),
    tauxEstrAnnuel: 0.035,
    prixElectriciteParKwh: centimes(16),
    coursCotonParKg: centimes(180),
    inflationMensuelle: 0.002,
  };
}

function etatInitial(
  evenements: readonly EvenementPlanifie[] = [],
): EtatMonde {
  const grandLivres: Record<IdEntreprise, GrandLivre> = {
    [ENT]: planComptableV1(),
  };
  return {
    instantCourant: instantJeu(0),
    monde: mondeTest(),
    grandLivres,
    evenementsPlanifies: evenements,
  };
}

function entrees(
  etat: EtatMonde,
  instantFin: number,
): Parameters<typeof avancer>[0] {
  return {
    etat,
    decisions: [],
    marketInputs: inputsTest(),
    params: chargerParametresV1(),
    instantFin: instantJeu(instantFin),
    graine: graine(42),
  };
}

const UN_MOIS_MIN = MINUTES_PAR_MOIS_JEU;

describe("avancer — rien à faire", () => {
  it("instantFin = instantCourant : état inchangé", () => {
    const etat = etatInitial();
    const r = avancer(entrees(etat, 0));
    expect(r.nouvelEtat).toEqual(etat);
    expect(r.evenementsExecutes).toHaveLength(0);
  });

  it("refuse un instantFin antérieur à instantCourant", () => {
    const etat: EtatMonde = { ...etatInitial(), instantCourant: instantJeu(100) };
    expect(() => avancer(entrees(etat, 50))).toThrow();
  });
});

describe("critère T17 — livraison matière fire à son horodatage", () => {
  const livraison: EvenementPlanifie = {
    type: "livraison_matiere",
    id: "ev_livr",
    instant: instantJeu(UN_MOIS_MIN),
    entreprise: ENT,
    commandeId: "cmd_1",
    matiere: MAT,
    quantite: 100,
    prixUnitaire: centimes(500),
  };

  it("avant l'horodatage : événement en attente, aucune écriture, stock vide", () => {
    const etat = etatInitial([livraison]);
    const r = avancer(entrees(etat, UN_MOIS_MIN - 60));
    expect(r.evenementsExecutes).toHaveLength(0);
    expect(r.nouvelEtat.evenementsPlanifies).toHaveLength(1);
    const ent = r.nouvelEtat.monde.entreprises[0]!;
    expect(ent.stocksMatiere).toHaveLength(0);
    expect(soldeCompte(r.nouvelEtat.grandLivres[ENT]!, "31")).toBe(0);
  });

  it("pile à l'horodatage : événement exécuté", () => {
    const etat = etatInitial([livraison]);
    const r = avancer(entrees(etat, UN_MOIS_MIN));
    expect(r.evenementsExecutes).toHaveLength(1);
    expect(r.nouvelEtat.evenementsPlanifies).toHaveLength(0);
    const ent = r.nouvelEtat.monde.entreprises[0]!;
    expect(ent.stocksMatiere).toHaveLength(1);
    expect(ent.stocksMatiere[0]!.quantite).toBe(100);
    expect(ent.stocksMatiere[0]!.valeurTotale).toBe(50_000);
    expect(soldeCompte(r.nouvelEtat.grandLivres[ENT]!, "31")).toBe(50_000);
    expect(soldeCompte(r.nouvelEtat.grandLivres[ENT]!, "401")).toBe(50_000);
    expect(enEquilibre(r.nouvelEtat.grandLivres[ENT]!)).toBe(true);
  });

  it("après l'horodatage : événement déjà consommé", () => {
    const etat = etatInitial([livraison]);
    const r = avancer(entrees(etat, UN_MOIS_MIN * 2));
    expect(r.evenementsExecutes).toHaveLength(1);
    expect(r.nouvelEtat.evenementsPlanifies).toHaveLength(0);
  });
});

describe("critère T17 — équivalence des parcours (déterminisme)", () => {
  const livraison: EvenementPlanifie = {
    type: "livraison_matiere",
    id: "ev_1",
    instant: instantJeu(UN_MOIS_MIN),
    entreprise: ENT,
    commandeId: "c",
    matiere: MAT,
    quantite: 100,
    prixUnitaire: centimes(500),
  };

  it("avancer en un bond vs par petits pas donne le même résultat final", () => {
    const etat = etatInitial([livraison]);
    // En un bond : 0 → 2 mois
    const direct = avancer(entrees(etat, UN_MOIS_MIN * 2));
    // En 4 pas de 30 min chacun = 2 mois total : 0 → 720 → 1440 → 2160 → 2880
    let courant = etat;
    for (const t of [720, 1440, 2160, 2880]) {
      courant = avancer(entrees(courant, t)).nouvelEtat;
    }
    const entDirect = direct.nouvelEtat.monde.entreprises[0]!;
    const entPasAPas = courant.monde.entreprises[0]!;
    expect(entDirect.stocksMatiere).toEqual(entPasAPas.stocksMatiere);
    expect(entDirect.marque.notoriete).toBeCloseTo(entPasAPas.marque.notoriete, 8);
    expect(courant.evenementsPlanifies).toHaveLength(0);
  });
});

describe("plusieurs événements : ordre chronologique respecté", () => {
  it("deux livraisons à t1 < t2 : stocks additionnés dans le bon ordre", () => {
    const ev1: EvenementPlanifie = {
      type: "livraison_matiere",
      id: "a",
      instant: instantJeu(60),
      entreprise: ENT,
      commandeId: "c1",
      matiere: MAT,
      quantite: 50,
      prixUnitaire: centimes(500),
    };
    const ev2: EvenementPlanifie = {
      type: "livraison_matiere",
      id: "b",
      instant: instantJeu(120),
      entreprise: ENT,
      commandeId: "c2",
      matiere: MAT,
      quantite: 30,
      prixUnitaire: centimes(500),
    };
    const etat = etatInitial([ev2, ev1]); // ordre volontairement inversé
    const r = avancer(entrees(etat, 200));
    expect(r.evenementsExecutes).toHaveLength(2);
    expect(r.evenementsExecutes[0]!.id).toBe("a");
    expect(r.evenementsExecutes[1]!.id).toBe("b");
    const ent = r.nouvelEtat.monde.entreprises[0]!;
    expect(ent.stocksMatiere[0]!.quantite).toBe(80);
  });
});

describe("échéance de prêt", () => {
  const echeance: EvenementPlanifie = {
    type: "echeance_pret",
    id: "ev_ech",
    instant: instantJeu(UN_MOIS_MIN),
    entreprise: ENT,
    pretId: idPret("pret_1"),
    numeroEcheance: 1,
    interets: centimes(4167),
    amortissement: centimes(81_390),
    mensualite: centimes(85_557),
  };

  it("écrit 164+661/512 et met à jour le capital restant", () => {
    // État initial : prêt déjà débloqué (512 débit 1M / 164 crédit 1M)
    const etat = etatInitial([echeance]);
    const glAvecDeblocage = {
      ...etat.grandLivres[ENT]!,
      ecritures: [
        {
          id: "deblocage",
          mois: moisJeu(0),
          libelle: "Déblocage prêt initial",
          lignes: [
            { compte: "512" as const, sens: "debit" as const, montant: centimes(1_000_000) },
            { compte: "164" as const, sens: "credit" as const, montant: centimes(1_000_000) },
          ],
        },
      ],
    };
    const etatAvecDeblocage: EtatMonde = {
      ...etat,
      grandLivres: { [ENT]: glAvecDeblocage },
    };
    const r = avancer(entrees(etatAvecDeblocage, UN_MOIS_MIN));
    expect(soldeCompte(r.nouvelEtat.grandLivres[ENT]!, "661")).toBe(4167);
    expect(soldeCompte(r.nouvelEtat.grandLivres[ENT]!, "164")).toBe(
      1_000_000 - 81_390,
    );
    expect(soldeCompte(r.nouvelEtat.grandLivres[ENT]!, "512")).toBe(
      1_000_000 - 85_557,
    );
    expect(enEquilibre(r.nouvelEtat.grandLivres[ENT]!)).toBe(true);
    const pret = r.nouvelEtat.monde.entreprises[0]!.prets[0]!;
    expect(pret.capitalRestant).toBe(1_000_000 - 81_390);
  });
});

describe("avance pure (sans événement)", () => {
  it("fait décroître la marque continûment", () => {
    const etat = etatInitial();
    const r = avancer(entrees(etat, 720));
    const ent = r.nouvelEtat.monde.entreprises[0]!;
    const attendu = 40 * Math.exp(-0.05 * (720 / MINUTES_PAR_MOIS_JEU));
    expect(ent.marque.notoriete).toBeCloseTo(attendu, 5);
  });
});
