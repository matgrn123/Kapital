import { chargerModulesV1, chargerParametresV1, type Parametres } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { postesALaSignature } from "../atelier/effetsPlan.js";
import type { Entreprise, Salarie } from "../types/entreprise.js";
import { centimes, idEntreprise, idMatiere, idProduit, idSalarie } from "../types/primitifs.js";
import { cumulVide, type CumulMois, type DonneesFlux } from "./donneesMois.js";
import { avancerFlux } from "./flux.js";
import { debutDuMoisMs, finDuMoisMs, indexDuMois } from "./temps.js";

// Lot T4 (défaut signalé par T5) : un artisan embauché en cours de mois ne produit qu'à partir
// de son embauche. Avant, la production se calculait depuis le début du mois : l'embauche du 21
// produisait d'un coup les 20 jours déjà écoulés.

const PARAMS = chargerParametresV1();
/** Rendement constant (min = max = 0,75) : la capacité ne dépend plus que du temps de présence. */
const PARAMS_R: Parametres = {
  ...PARAMS,
  rendement_atelier_min: { ...PARAMS["rendement_atelier_min"]!, valeur: PARAMS["rendement_atelier_max"]!.valeur },
};
const NOVEMBRE = indexDuMois(2026, 11);
const JOUR = 86_400_000;
const DEBUT = debutDuMoisMs(NOVEMBRE);
const TSHIRT = idProduit("prod_tshirt");
const JERSEY = idMatiere("mat_jersey_coton");
/** Un artisan au rendement 0,75 : 151,67 h × 60 × 0,75 = 6 825 minutes, soit 273 t-shirts de 25 min par mois. */
const PIECES_PAR_ARTISAN_ET_PAR_MOIS = 273;

const FLUX_VIDE: DonneesFlux = { livraisonsMatiere: [], livraisonsFaconniers: [], depensesMarketing: [], creancesAEncaisser: [] };

function artisan(id: string, embaucheMs?: number): Salarie {
  return {
    id: idSalarie(id),
    poste: "artisan",
    salaireBrutMensuel: centimes(200_000),
    ancienneteMois: 12,
    experienceMois: 12,
    ...(embaucheMs === undefined ? {} : { embaucheMs }),
  };
}

function entreprise(salaries: readonly Salarie[]): Entreprise {
  return {
    id: idEntreprise("ent_prod"),
    nom: "Production SAS",
    gamme: "milieu",
    etape: 2,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(10_000_000),
    stocksMatiere: [{ matiere: JERSEY, quantite: 100_000, valeurTotale: centimes(50_000_000) }],
    stocksFinis: [],
    salaries,
    ateliers: [{ surfaceM2: 100, loyerMensuel: centimes(100_000), modules: postesALaSignature(2, chargerModulesV1()) }],
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [],
    catalogue: [
      {
        produit: TSHIRT,
        qualiteVisee: 3,
        prix: { vente_directe: centimes(3000), revendeur: centimes(2000) },
        productionMensuelleCible: 100_000,
        fabrication: { matiere: JERSEY, consommationParPiece: 0.8, fournituresParPiece: centimes(60), tempsStandardMinutes: 25 },
      },
    ],
  };
}

/** Avance du jour `de` au jour `a` de novembre (un pas = un jour, 30 pas). */
function jours(e: Entreprise, cumul: CumulMois, de: number, a: number) {
  return avancerFlux(e, cumul, FLUX_VIDE, {
    params: PARAMS_R,
    mois: NOVEMBRE,
    pasDebut: de,
    pasFin: a,
    pasParMois: 30,
    suffixeId: `_${a}`,
  });
}

const produit = (c: CumulMois) => c.produitParProduit[TSHIRT] ?? 0;

describe("production d'un artisan comptée à partir de son embauche", () => {
  it("embauche le 21 novembre à minuit : le jour du 21 produit 2 journées d'artisan, pas 20 jours de rattrapage", () => {
    const ancien = artisan("ancien");
    const avant = jours(entreprise([ancien]), cumulVide(NOVEMBRE, centimes(10_000_000)), 0, 20);
    // 20 jours d'un artisan : 273 × 20/30 = 182 pièces
    expect(produit(avant.cumul)).toBe(182);

    const avecNouveau = { ...avant.entreprise, salaries: [ancien, artisan("nouveau", DEBUT + 20 * JOUR)] };
    const le21 = jours(avecNouveau, avant.cumul, 20, 21);
    const produitLe21 = produit(le21.cumul) - produit(avant.cumul);
    // Un jour de l'ancien + un jour du nouveau : 2 × 273 / 30 ≈ 18 pièces (avant le correctif : 200).
    expect(produitLe21).toBeGreaterThanOrEqual(17);
    expect(produitLe21).toBeLessThanOrEqual(19);
  });

  it("mois pris d'un bloc, embauche le 21 novembre à 10 h : le nouveau produit 9 jours et 14 heures sur 30", () => {
    const embauche = Date.UTC(2026, 10, 21, 9, 0);
    const e = entreprise([artisan("ancien"), artisan("nouveau", embauche)]);
    const r = avancerFlux(e, cumulVide(NOVEMBRE, e.tresorerie), FLUX_VIDE, {
      params: PARAMS_R,
      mois: NOVEMBRE,
      pasDebut: 0,
      pasFin: 1,
      pasParMois: 1,
      suffixeId: "",
    });
    const presence = (finDuMoisMs(NOVEMBRE) - embauche) / (30 * JOUR);
    const attendu = PIECES_PAR_ARTISAN_ET_PAR_MOIS * (1 + presence); // ≈ 360 (avant : 546)
    expect(Math.abs(produit(r.cumul) - attendu)).toBeLessThanOrEqual(2);
  });

  it("par petits morceaux ou d'un bloc : même production à la fin du mois", () => {
    const e = entreprise([artisan("ancien"), artisan("nouveau", DEBUT + 20 * JOUR)]);
    const bloc = jours(e, cumulVide(NOVEMBRE, e.tresorerie), 0, 30);
    let cumul = cumulVide(NOVEMBRE, e.tresorerie);
    let ent = e;
    for (let j = 0; j < 30; j += 1) {
      const r = jours(ent, cumul, j, j + 1);
      ent = r.entreprise;
      cumul = r.cumul;
    }
    expect(produit(cumul)).toBe(produit(bloc.cumul));
    // 273 + 273 × 10/30 = 364
    expect(produit(bloc.cumul)).toBe(364);
  });

  it("embauché après la fin du flux (rattrapage) : il ne produit rien pour ce mois", () => {
    const e = entreprise([artisan("ancien"), artisan("nouveau", finDuMoisMs(NOVEMBRE) + JOUR)]);
    expect(produit(jours(e, cumulVide(NOVEMBRE, e.tresorerie), 0, 30).cumul)).toBe(PIECES_PAR_ARTISAN_ET_PAR_MOIS);
  });

  it("sans date d'embauche (banc d'essai) : présent tout le mois, comme avant", () => {
    const e = entreprise([artisan("a"), artisan("b")]);
    expect(produit(jours(e, cumulVide(NOVEMBRE, e.tresorerie), 0, 30).cumul)).toBe(2 * PIECES_PAR_ARTISAN_ET_PAR_MOIS);
  });
});
