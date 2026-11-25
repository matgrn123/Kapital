import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { primeRisque, reglesPretDepuis, tauxPret } from "./capacite.js";
import { centimes } from "../types/primitifs.js";

const PARAMS = chargerParametresV1();
const R = reglesPretDepuis(PARAMS);
const v = (k: string) => PARAMS[k]!.valeur;

describe("prime de risque du taux bancaire", () => {
  it("nulle pour une entreprise sans dette ni découvert", () => {
    expect(primeRisque({ tresorerie: centimes(1_000_000), detteApresPret: centimes(0), moisDecouvertConsecutifs: 0 }, R)).toBe(0);
  });
  it("croît avec l'endettement et devient pleine au ratio paramétré", () => {
    const ratioPlein = v("pret_prime_risque_ratio_endettement_prime_pleine");
    const moitie = primeRisque({ tresorerie: centimes(100_000), detteApresPret: centimes(Math.round(100_000 * ratioPlein / 2)), moisDecouvertConsecutifs: 0 }, R);
    const plein = primeRisque({ tresorerie: centimes(100_000), detteApresPret: centimes(100_000 * ratioPlein * 4), moisDecouvertConsecutifs: 0 }, R);
    expect(moitie).toBeCloseTo(v("pret_prime_risque_endettement_max") / 2, 10);
    expect(plein).toBeCloseTo(v("pret_prime_risque_endettement_max"), 10);
  });
  it("trésorerie nulle ou négative avec dette : prime d'endettement pleine", () => {
    expect(primeRisque({ tresorerie: centimes(-5_000), detteApresPret: centimes(1), moisDecouvertConsecutifs: 0 }, R))
      .toBeCloseTo(v("pret_prime_risque_endettement_max"), 10);
  });
  it("ajoute une prime par mois de découvert, plafonnée", () => {
    const deux = primeRisque({ tresorerie: centimes(100_000), detteApresPret: centimes(0), moisDecouvertConsecutifs: 2 }, R);
    expect(deux).toBeCloseTo(2 * v("pret_prime_risque_par_mois_decouvert"), 10);
    const beaucoup = primeRisque({ tresorerie: centimes(-1), detteApresPret: centimes(1), moisDecouvertConsecutifs: 1000 }, R);
    expect(beaucoup).toBeCloseTo(v("pret_prime_risque_totale_max"), 10);
  });
  it("taux = €STR + marge de l'objet + prime ; sans situation, pas de prime", () => {
    const risque = { tresorerie: centimes(100_000), detteApresPret: centimes(0), moisDecouvertConsecutifs: 1 };
    expect(tauxPret("equipement", 0.02, R, risque)).toBeCloseTo(
      0.02 + v("pret_marge_estr_equipement") + v("pret_prime_risque_par_mois_decouvert"), 10);
    expect(tauxPret("equipement", 0.02, R)).toBeCloseTo(0.02 + v("pret_marge_estr_equipement"), 10);
  });
});

import { enregistrerDeblocagePret } from "./calculs.js";
import { planComptableV1 } from "../comptabilite/index.js";
import { moisJeu } from "../types/primitifs.js";

describe("libellé de la mise à disposition du prêt", () => {
  it("identique à la fonction SQL creer_pret", () => {
    const gl = enregistrerDeblocagePret(planComptableV1(), { idEcriture: "p", mois: moisJeu(1), capital: centimes(1000) });
    expect(gl.ecritures.at(-1)!.libelle).toBe("Mise à disposition du prêt");
  });
});
