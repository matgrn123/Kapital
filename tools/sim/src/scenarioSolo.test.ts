import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import {
  calculImpotSocietes,
  centimes,
  enEquilibre,
  parametresIsDepuis,
  resultat,
  soldeCompte,
} from "@kapital/engine";
import { grandLivreDepuis } from "./gardeFou.js";
import { jouerScenarioSolo } from "./scenarioSolo.js";

// AE-8 : scénario solo de 24 mois, de la création aux embauches.
// Critère : étape 2 atteinte ; bilan équilibré chaque mois ; résultat rejouable à l'identique.

const scenario = jouerScenarioSolo({ mois: 24, graine: 7 });
const { etat, journal } = scenario;

/**
 * Anomalies du garde-fou dues à des bugs du moteur déjà signalés (PR AE-8) : le banc les
 * tolère pour rester vert, mais en échoue sur toute autre. À retirer quand le bug est corrigé
 * (le test « aucune anomalie » marqué `fails` se mettra alors à échouer pour le rappeler).
 *  - stock_fini_sans_ecriture : arrondi du coût moyen à la vente (flux.ts › diminuerStockFini).
 */
const ANOMALIES_CONNUES = new Set(["stock_fini_sans_ecriture"]);

describe("AE-8 · scénario solo de 24 mois", () => {
  it("joue 24 clôtures, de la création aux embauches", () => {
    expect(etat.historique).toHaveLength(24);
    expect(journal).toContain("mois 0 : série de lancement");
    expect(journal.some((l) => l.includes(": bail petit_atelier"))).toBe(true);
    expect(journal.filter((l) => l.includes(": embauche d'un artisan")).length).toBeGreaterThanOrEqual(2);
    expect(etat.entreprise.salaries.length).toBeGreaterThanOrEqual(2);
  });

  it("atteint l'étape 2, sans jamais revenir en arrière", () => {
    const etapes = etat.historique.map((b) => b.etape);
    expect(etapes.at(-1)).toBe(2);
    for (let i = 1; i < etapes.length; i++) expect(etapes[i]!).toBeGreaterThanOrEqual(etapes[i - 1]!);
    const premier = etat.historique.find((b) => b.etape === 2)!;
    const seuil = chargerParametresV1()["seuil_etape_2_chiffre_affaires_ht_cumule_centimes"]!.valeur;
    expect(premier.chiffreAffairesHtCumule).toBeGreaterThanOrEqual(seuil);
    expect(premier.tresorerie).toBeGreaterThan(0);
  });

  it("le bilan est équilibré à chaque clôture", () => {
    for (const b of etat.historique) {
      const gl = grandLivreDepuis(etat.ecritures.filter((e) => e.mois <= b.mois));
      expect(enEquilibre(gl), `mois ${b.mois}`).toBe(true);
    }
  });

  it("la production de l'atelier démarre après les embauches", () => {
    expect(etat.ecritures.some((e) => e.id.startsWith("production_atelier_"))).toBe(true);
  });

  it("est rejouable à l'identique avec la même graine", () => {
    const encore = jouerScenarioSolo({ mois: 24, graine: 7 });
    expect(JSON.stringify(encore.etat)).toBe(JSON.stringify(etat));
    expect(encore.journal).toEqual(journal);
  });
});

describe("3D-9 · garde-fou monétaire sur les 24 clôtures", () => {
  it("aucune anomalie en dehors des bugs moteur déjà signalés", () => {
    for (const b of etat.historique) {
      const inconnues = b.anomalies.filter((a) => !ANOMALIES_CONNUES.has(a.code));
      expect(inconnues, `mois ${b.mois}`).toEqual([]);
    }
  });

  it("la trésorerie du moteur est le solde du compte 512 à chaque clôture", () => {
    for (const b of etat.historique) {
      const gl = grandLivreDepuis(etat.ecritures.filter((e) => e.mois <= b.mois));
      expect(b.tresorerie, `mois ${b.mois}`).toBe(soldeCompte(gl, "512"));
    }
  });

  // Bug moteur signalé : à la vente, le stock 35 est crédité de « coût moyen arrondi × quantité »
  // alors que le stock du moteur baisse de « arrondi(coût moyen × quantité) ». L'écart reste
  // dans le stock du moteur, sans écriture. `fails` : ce test doit passer quand ce sera corrigé.
  it.fails("aucune anomalie du tout (bug d'arrondi du coût moyen, signalé)", () => {
    for (const b of etat.historique) expect(b.anomalies, `mois ${b.mois}`).toEqual([]);
  });
});

describe("constats du banc (bugs signalés, non corrigés ici)", () => {
  // L'impôt de fin d'exercice est calculé sur le résultat du seul 12e mois (cloture.ts ›
  // agrégats du mois), pas sur celui des 12 mois de l'exercice.
  it.fails("l'impôt sur les sociétés porte sur le résultat de l'exercice entier", () => {
    const params = chargerParametresV1();
    const exercice = grandLivreDepuis(etat.ecritures.filter((e) => e.mois <= 11 && !e.id.startsWith("is_")));
    const attendu = calculImpotSocietes(centimes(Math.max(0, resultat(exercice))), parametresIsDepuis(params));
    const passe = etat.ecritures.find((e) => e.id.startsWith("is_11_"))?.lignes[0]?.montant ?? 0;
    expect(passe).toBe(attendu);
  });

  // Le serveur (StockageSupabase.chargerFinDeMois) paie le solde net du 44551 du mois
  // précédent, paiement de ce mois-là déduit : une TVA sur deux n'est jamais payée.
  it("la formule de TVA du serveur laisse de la TVA impayée qui s'accumule", () => {
    const serveur = jouerScenarioSolo({ mois: 24, graine: 7, tva: "serveur" }).etat;
    const declare = (e: typeof etat, m: number) =>
      e.ecritures
        .filter((x) => x.mois === m)
        .flatMap((x) => x.lignes)
        .filter((l) => l.compte === "44551" && l.sens === "credit")
        .reduce((s, l) => s + l.montant, 0);
    // Règle juste : seule la TVA déclarée au dernier mois reste à payer.
    expect(soldeCompte(grandLivreDepuis(etat.ecritures), "44551")).toBe(declare(etat, 23));
    // Formule du serveur : bien plus, et cela grossit avec le temps.
    expect(soldeCompte(grandLivreDepuis(serveur.ecritures), "44551")).toBeGreaterThan(5 * declare(serveur, 23));
  });
});
