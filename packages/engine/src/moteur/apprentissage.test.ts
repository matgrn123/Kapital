import { chargerModulesV1, chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { experienceEnJours, rendement } from "../atelier/calculs.js";
import { postesALaSignature } from "../atelier/effetsPlan.js";
import type { Entreprise, Salarie } from "../types/entreprise.js";
import { centimes, idEntreprise, idMatiere, idProduit, idSalarie } from "../types/primitifs.js";
import { planProductionDuMois } from "./flux.js";
import { debutDuMoisMs, indexDuMois } from "./temps.js";

// Horloge réelle (décision de Mathieu du 26/11/2026) : un salarié apprend en ~2 semaines
// (rendement_tau_jours = 14), son expérience est comptée en jours depuis l'embauche.

const PARAMS = chargerParametresV1();
const JOUR = 86_400_000;
const NOVEMBRE_2026 = indexDuMois(2026, 11);
/** Jeudi 26 novembre 2026, 10 h 21 à Paris (heure du jeu). */
const MAINTENANT = Date.UTC(2026, 10, 26, 9, 21);

function artisan(id: string, embaucheMs?: number, experienceMois = 0): Salarie {
  return {
    id: idSalarie(id),
    poste: "artisan",
    salaireBrutMensuel: centimes(200_000),
    ancienneteMois: experienceMois,
    experienceMois,
    ...(embaucheMs === undefined ? {} : { embaucheMs }),
  };
}

function entreprise(salaries: readonly Salarie[]): Entreprise {
  return {
    id: idEntreprise("ent_apprentissage"),
    nom: "Apprentissage SAS",
    gamme: "milieu",
    etape: 2,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(10_000_000),
    stocksMatiere: [],
    stocksFinis: [],
    salaries,
    ateliers: [{ surfaceM2: 100, loyerMensuel: centimes(100_000), modules: postesALaSignature(2, chargerModulesV1()) }],
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [],
    catalogue: [
      {
        produit: idProduit("prod_tshirt"),
        qualiteVisee: 3,
        prix: { vente_directe: centimes(3000), revendeur: centimes(2000) },
        productionMensuelleCible: 100_000,
        fabrication: {
          matiere: idMatiere("mat_jersey_coton"),
          consommationParPiece: 0.8,
          fournituresParPiece: centimes(60),
          tempsStandardMinutes: 30,
        },
      },
    ],
  };
}

const pieces = (e: Entreprise, instantMs: number) =>
  planProductionDuMois(e, PARAMS, instantMs).reduce((s, l) => s + l.pieces, 0);

describe("paramètres de l'apprentissage", () => {
  it("tau en jours (14) ; l'ancien tau en mois a disparu", () => {
    expect(PARAMS["rendement_tau_jours"]).toMatchObject({ valeur: 14, unite: "jours" });
    expect(PARAMS["rendement_tau_mois"]).toBeUndefined();
  });
});

describe("experienceEnJours", () => {
  it("compte les jours écoulés depuis l'embauche", () => {
    expect(experienceEnJours(artisan("a", MAINTENANT - 14 * JOUR), MAINTENANT)).toBe(14);
    expect(experienceEnJours(artisan("a", MAINTENANT - JOUR / 2), MAINTENANT)).toBe(0.5);
    expect(experienceEnJours(artisan("a", MAINTENANT), MAINTENANT)).toBe(0);
  });

  it("jamais négative (embauche datée après l'instant)", () => {
    expect(experienceEnJours(artisan("a", MAINTENANT + JOUR), MAINTENANT)).toBe(0);
  });

  it("sans date d'embauche : embauché au début du mois, experienceMois mois complets avant le mois de l'instant", () => {
    const debutNovembre = debutDuMoisMs(NOVEMBRE_2026);
    expect(experienceEnJours(artisan("a", undefined, 0), debutNovembre)).toBe(0);
    // Un mois d'expérience au 1er décembre : les 30 jours de novembre.
    expect(experienceEnJours(artisan("a", undefined, 1), debutDuMoisMs(NOVEMBRE_2026 + 1))).toBe(30);
    // Deux mois au 1er mars 2027 : janvier (31) + février (28).
    expect(experienceEnJours(artisan("a", undefined, 2), debutDuMoisMs(indexDuMois(2027, 3)))).toBe(59);
  });
});

describe("rendement de l'atelier : apprentissage en jours", () => {
  const rMin = PARAMS["rendement_atelier_min"]!.valeur;
  const rMax = PARAMS["rendement_atelier_max"]!.valeur;
  const tau = PARAMS["rendement_tau_jours"]!.valeur;

  it("un débutant du jour produit au rendement minimal, un artisan de 14 jours aux deux tiers du chemin", () => {
    const capacite = (embaucheMs: number) => pieces(entreprise([artisan("a", embaucheMs)]), MAINTENANT);
    const debutant = capacite(MAINTENANT);
    const quinzaine = capacite(MAINTENANT - tau * JOUR);
    const ancien = capacite(MAINTENANT - 365 * JOUR);
    expect(debutant).toBeGreaterThan(0);
    expect(quinzaine).toBeGreaterThan(debutant);
    expect(ancien).toBeGreaterThan(quinzaine);
    // Production proportionnelle au rendement (même capacité horaire, même produit).
    const r14 = rendement(tau, rMin, rMax, tau);
    expect(quinzaine / debutant).toBeCloseTo(r14 / rMin, 2);
    expect(ancien / debutant).toBeCloseTo(rMax / rMin, 2);
  });

  it("l'expérience vient de l'instant : le même artisan produit plus une semaine plus tard", () => {
    const e = entreprise([artisan("a", MAINTENANT)]);
    expect(pieces(e, MAINTENANT + 7 * JOUR)).toBeGreaterThan(pieces(e, MAINTENANT));
  });

  it("rendement moyen des artisans au poste (un ancien et un débutant)", () => {
    const duo = pieces(entreprise([artisan("a", MAINTENANT - 365 * JOUR), artisan("b", MAINTENANT)]), MAINTENANT);
    const deuxAnciens = pieces(
      entreprise([artisan("a", MAINTENANT - 365 * JOUR), artisan("b", MAINTENANT - 365 * JOUR)]),
      MAINTENANT,
    );
    expect(duo).toBeLessThan(deuxAnciens);
  });
});
