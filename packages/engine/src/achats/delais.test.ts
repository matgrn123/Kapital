import { describe, expect, it } from "vitest";
import { indexDuMois } from "../moteur/temps.js";
import { livraisonApresHeures, livraisonApresMinutes, minutesDuDelai } from "./delais.js";

const HEURE = 3_600_000;
const NOVEMBRE_2026 = indexDuMois(2026, 11);
const DECEMBRE_2026 = indexDuMois(2026, 12);
/** Jeudi 26 novembre 2026, 10 h 21 à Paris (heure d'hiver : UTC + 1). */
const JEU_26_NOV_10H21 = Date.UTC(2026, 10, 26, 9, 21);

describe("livraison en heures réelles", () => {
  it("commande à 10 h 21 chez un fournisseur à 2 h : livrée à 12 h 21, en novembre 2026", () => {
    const l = livraisonApresHeures(JEU_26_NOV_10H21, 2);
    expect(l.instantLivraisonMs - JEU_26_NOV_10H21).toBe(2 * HEURE);
    expect(l.instantLivraisonMs).toBe(Date.UTC(2026, 10, 26, 11, 21));
    expect(l.moisLivraison).toBe(NOVEMBRE_2026);
  });

  it("commande le 30 novembre à 23 h (Paris) avec 4 h de délai : livrée le 1er décembre à 3 h, en décembre", () => {
    const commande = Date.UTC(2026, 10, 30, 22, 0);
    const l = livraisonApresHeures(commande, 4);
    expect(l.instantLivraisonMs).toBe(Date.UTC(2026, 11, 1, 2, 0));
    expect(l.moisLivraison).toBe(DECEMBRE_2026);
  });

  it("le changement de mois suit l'heure de Paris, pas UTC (heure d'été)", () => {
    // 30 juin 2026 à 21 h à Paris = 19 h UTC ; + 2 h = 23 h à Paris : encore juin.
    expect(livraisonApresHeures(Date.UTC(2026, 5, 30, 19, 0), 2).moisLivraison).toBe(indexDuMois(2026, 6));
    // + 4 h = 1er juillet à 1 h à Paris (23 h UTC le 30 juin) : juillet.
    expect(livraisonApresHeures(Date.UTC(2026, 5, 30, 19, 0), 4).moisLivraison).toBe(indexDuMois(2026, 7));
  });

  it("le grossiste : 30 minutes", () => {
    const l = livraisonApresMinutes(JEU_26_NOV_10H21, 30);
    expect(l.instantLivraisonMs - JEU_26_NOV_10H21).toBe(30 * 60_000);
    expect(l.moisLivraison).toBe(NOVEMBRE_2026);
  });

  it("un délai en heures fractionnaires est arrondi à la minute", () => {
    expect(minutesDuDelai(0.5)).toBe(30);
    expect(minutesDuDelai(6)).toBe(360);
  });

  it("refuse un délai négatif ou non fini, et un instant non fini", () => {
    expect(() => livraisonApresHeures(JEU_26_NOV_10H21, -1)).toThrow(/Délai/);
    expect(() => livraisonApresHeures(JEU_26_NOV_10H21, Number.NaN)).toThrow(/Délai/);
    expect(() => livraisonApresMinutes(JEU_26_NOV_10H21, Number.POSITIVE_INFINITY)).toThrow(/Délai/);
    expect(() => livraisonApresHeures(Number.NaN, 2)).toThrow(/Instant/);
  });
});
