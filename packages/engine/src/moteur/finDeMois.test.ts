import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { planComptableV1 } from "../comptabilite/index.js";
import { calculImpotSocietes, parametresIsDepuis } from "../impots/calculs.js";
import type { Entreprise } from "../types/entreprise.js";
import { centimes, idEntreprise, moisJeu } from "../types/primitifs.js";
import { cloturerMois } from "./cloture.js";
import { cumulVide } from "./donneesMois.js";
import { debutExercice, resultatDepuisLignes, tvaRestantDue } from "./finDeMois.js";

const PARAMS = chargerParametresV1();

function entreprise(): Entreprise {
  return {
    id: idEntreprise("ent_is"),
    nom: "IS SAS",
    gamme: "milieu",
    etape: 2,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(50_000_000),
    stocksMatiere: [],
    stocksFinis: [],
    salaries: [],
    atelier: null,
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [],
    catalogue: [],
  };
}

describe("tvaRestantDue", () => {
  it("paie ce qui reste dû au 44551 : déclarations moins paiements déjà faits", () => {
    // Mois 0 : déclaré 300 ; mois 1 : payé 300, déclaré 500.
    const lignes = [
      { sens: "credit", montant: 300 },
      { sens: "debit", montant: 300 },
      { sens: "credit", montant: 500 },
    ] as const;
    expect(tvaRestantDue(lignes)).toBe(500);
  });
  it("rattrape une TVA restée impayée", () => {
    expect(tvaRestantDue([{ sens: "credit", montant: 300 }, { sens: "credit", montant: 500 }])).toBe(800);
  });
  it("ne paie jamais un montant négatif", () => {
    expect(tvaRestantDue([{ sens: "debit", montant: 100 }])).toBe(0);
  });
});

describe("exercice et résultat", () => {
  it("l'exercice commence au mois multiple de 12", () => {
    expect(debutExercice(11)).toBe(0);
    expect(debutExercice(23)).toBe(12);
    expect(debutExercice(12)).toBe(12);
  });
  it("résultat = produits − charges, selon le plan comptable", () => {
    const lignes = [
      { compte: "707", sens: "credit", montant: 10_000 },
      { compte: "613", sens: "debit", montant: 3_000 },
      { compte: "512", sens: "debit", montant: 7_000 },
    ] as const;
    expect(resultatDepuisLignes(lignes, planComptableV1().comptes)).toBe(7_000);
  });
});

describe("clôture : l'IS porte sur l'exercice entier", () => {
  it("au 12e mois, l'impôt se calcule sur le résultat des 12 mois, pas du seul dernier", () => {
    const avant = centimes(5_000_000); // 50 000 € de bénéfice sur les 11 premiers mois
    const r = cloturerMois(
      entreprise(),
      cumulVide(moisJeu(11), centimes(50_000_000)),
      { tvaAPayerCeMois: centimes(0), moisDecouvertConsecutifs: 0, resultatExerciceAvantMois: avant },
      PARAMS,
      moisJeu(11),
    );
    const isPasse = r.ecritures.find((e) => e.id.startsWith("is_11_"))?.lignes[0]?.montant ?? 0;
    // Le 12e mois seul est en perte (aucune vente, aucun loyer : 0) ; sans le cumul, l'IS serait 0.
    const attendu = calculImpotSocietes(avant, parametresIsDepuis(PARAMS));
    expect(attendu).toBeGreaterThan(0);
    expect(isPasse).toBe(attendu);
  });
  it("sans résultat antérieur fourni, rien ne change (compatibilité)", () => {
    const r = cloturerMois(
      entreprise(),
      cumulVide(moisJeu(11), centimes(50_000_000)),
      { tvaAPayerCeMois: centimes(0), moisDecouvertConsecutifs: 0 },
      PARAMS,
      moisJeu(11),
    );
    expect(r.ecritures.some((e) => e.id.startsWith("is_11_"))).toBe(false);
  });
});
