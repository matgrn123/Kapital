import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import {
  capaciteMinutes,
  coutMinute,
  coutRevient,
  rendement,
} from "./calculs.js";
import { centimes, minutes } from "../types/primitifs.js";

describe("rendement", () => {
  it("vaut rMin quand l'expérience est nulle", () => {
    expect(rendement(0, 0.4, 0.75, 6)).toBe(0.4);
  });

  it("tend vers rMax quand l'expérience devient grande", () => {
    expect(rendement(1000, 0.4, 0.75, 6)).toBeCloseTo(0.75, 3);
  });

  it("vaut rMin + (rMax - rMin) × (1 - 1/e) à l'expérience = tau", () => {
    const r = rendement(6, 0.4, 0.75, 6);
    const attendu = 0.4 + (0.75 - 0.4) * (1 - 1 / Math.E);
    expect(r).toBeCloseTo(attendu, 5);
  });

  it("est monotone croissant en expérience", () => {
    const r0 = rendement(0, 0.4, 0.75, 6);
    const r6 = rendement(6, 0.4, 0.75, 6);
    const r24 = rendement(24, 0.4, 0.75, 6);
    expect(r6).toBeGreaterThan(r0);
    expect(r24).toBeGreaterThan(r6);
  });

  it("refuse une expérience négative ou un tau non strictement positif", () => {
    expect(() => rendement(-1, 0.4, 0.75, 6)).toThrow();
    expect(() => rendement(6, 0.4, 0.75, 0)).toThrow();
  });
});

describe("capaciteMinutes", () => {
  it("1 artisan, 151,67 h, rendement 70 % ≈ 6370 min produites", () => {
    const m = capaciteMinutes(1, Infinity, 151.67, 0.7);
    expect(m).toBeGreaterThanOrEqual(6369);
    expect(m).toBeLessThanOrEqual(6371);
  });

  it("0 artisan produit 0 minute", () => {
    expect(capaciteMinutes(0, Infinity, 151.67, 0.7)).toBe(0);
  });

  it("linéaire en nombre d'artisans quand les postes ne contraignent pas", () => {
    const un = capaciteMinutes(1, Infinity, 151.67, 0.7);
    const trois = capaciteMinutes(3, Infinity, 151.67, 0.7);
    expect(trois).toBe(un * 3);
  });

  // --- critère d'acceptation 3D-3 ------------------------------------------

  it("embaucher sans poste équipé n'augmente pas la production (critère 3D-3)", () => {
    const sansPoste = capaciteMinutes(3, 0, 151.67, 0.7);
    expect(sansPoste).toBe(0);
  });

  it("1 poste pour 3 artisans : seul 1 artisan produit", () => {
    const unPoste = capaciteMinutes(3, 1, 151.67, 0.7);
    const unArtisan = capaciteMinutes(1, Infinity, 151.67, 0.7);
    expect(unPoste).toBe(unArtisan);
  });

  it("autant de postes que d'artisans : capacité normale", () => {
    const avecPlan = capaciteMinutes(3, 3, 151.67, 0.7);
    const sansPlan = capaciteMinutes(3, Infinity, 151.67, 0.7);
    expect(avecPlan).toBe(sansPlan);
  });

  it("plus de postes que d'artisans : c'est le nombre d'artisans qui limite", () => {
    const avec = capaciteMinutes(2, 10, 151.67, 0.7);
    const ref = capaciteMinutes(2, Infinity, 151.67, 0.7);
    expect(avec).toBe(ref);
  });
});

describe("coutMinute", () => {
  it("salaires 1933 € sur 5651 min ≈ 34 centimes/min", () => {
    const c = coutMinute({
      chargesTotales: centimes(193_300),
      minutesProduites: minutes(5651),
    });
    expect(c).toBe(34);
  });

  it("refuse une capacité à 0 minutes produites", () => {
    expect(() =>
      coutMinute({
        chargesTotales: centimes(100_000),
        minutesProduites: minutes(0),
      }),
    ).toThrow();
  });

  it("un atelier à moitié vide voit son coût minute environ doubler", () => {
    const plein = coutMinute({
      chargesTotales: centimes(300_000),
      minutesProduites: minutes(10_000),
    });
    const demi = coutMinute({
      chargesTotales: centimes(300_000),
      minutesProduites: minutes(5000),
    });
    expect(demi).toBeGreaterThanOrEqual(plein * 2 - 1);
    expect(demi).toBeLessThanOrEqual(plein * 2 + 1);
  });
});

describe("coutRevient — critère T06 : scénario t-shirt France ≈ 20 €", () => {
  it("avec paramètres V1 et hypothèses du référentiel, coût ≈ 20 €", () => {
    const params = chargerParametresV1();
    const rMin = params["rendement_atelier_min"]!.valeur;
    const rMax = params["rendement_atelier_max"]!.valeur;
    const tau = params["rendement_tau_mois"]!.valeur;
    const heures = params["heures_mensuelles_legales"]!.valeur;
    const smic = params["cout_employeur_smic_mensuel"]!.valeur;
    const tauxChute = params["taux_chute_matiere_defaut"]!.valeur;

    const rend = rendement(tau, rMin, rMax, tau);
    const cap = capaciteMinutes(1, Infinity, heures, rend);

    const loyerMensuel = 100_000;
    const amortissementMensuel = 20_000;
    const energieMensuelle = 25_000;
    const chargesTotales = centimes(
      smic + loyerMensuel + amortissementMensuel + energieMensuelle,
    );

    const cm = coutMinute({ chargesTotales, minutesProduites: cap });
    expect(cm).toBeGreaterThanOrEqual(55);
    expect(cm).toBeLessThanOrEqual(65);

    const prixJersey = centimes(500);
    const consommation = 0.8;
    const fournitures = centimes(60);
    const tempsTshirt = minutes(25);

    const cr = coutRevient({
      prixMatiereParUnite: prixJersey,
      consommationParPiece: consommation,
      tauxChute,
      fournitures,
      tempsMinutes: tempsTshirt,
      coutMinute: cm,
    });

    expect(cr).toBeGreaterThan(1800);
    expect(cr).toBeLessThan(2200);
  });

  it("composition du coût : matière + fournitures + façon", () => {
    const cr = coutRevient({
      prixMatiereParUnite: centimes(500),
      consommationParPiece: 0.8,
      tauxChute: 0.15,
      fournitures: centimes(60),
      tempsMinutes: minutes(25),
      coutMinute: centimes(60),
    });
    expect(cr).toBe(460 + 60 + 1500);
  });
});
