import { centimes, finDuMoisMs, genererEcheancier, indexDuMois } from "@kapital/engine";
import { describe, expect, it } from "vitest";
import { lignesEcheancierEnBase } from "./demandePret.js";

// Lot T4 (horloge réelle) : chaque échéance d'un prêt tombe à la fin de son mois (minuit, heure
// de Paris), le moment où la clôture la paie. loan_schedules.instant_prevu = fin du mois
// (moisDebut + numéro), en instant réel (on ajoute worlds.debut_reel).

const NOVEMBRE_2026 = indexDuMois(2026, 11);

describe("échéancier enregistré en base", () => {
  const echeancier = genererEcheancier(centimes(1_200_000), 0.05, 3);

  it("prêt signé en novembre 2026 : échéances à la fin de décembre, janvier et février (minuit à Paris)", () => {
    const lignes = lignesEcheancierEnBase(echeancier, NOVEMBRE_2026, 0);
    expect(lignes.map((l) => l.instant_prevu)).toEqual([
      // L'échéance n° 1 est payée à la clôture du mois qui suit la signature : 1er janvier 0 h à Paris.
      "2026-12-31T23:00:00.000Z",
      "2027-01-31T23:00:00.000Z",
      "2027-02-28T23:00:00.000Z",
    ]);
    // Même instant que celui où la clôture du mois (moisDebut + numéro) la paie.
    expect(lignes[0]!.instant_prevu).toBe(new Date(finDuMoisMs(NOVEMBRE_2026 + 1)).toISOString());
  });

  it("recopie les montants de l'échéancier du moteur", () => {
    const [l] = lignesEcheancierEnBase(echeancier, NOVEMBRE_2026, 0);
    expect(l).toMatchObject({
      numero: 1,
      mensualite_centimes: echeancier[0]!.montant,
      interets_centimes: echeancier[0]!.interets,
      amortissement_centimes: echeancier[0]!.amortissement,
      capital_restant_apres_centimes: echeancier[0]!.capitalRestantApres,
    });
  });

  it("recette (debut_reel reculé de 10 jours) : instant réel = heure du jeu + debut_reel", () => {
    const recul = -10 * 86_400_000;
    const [l] = lignesEcheancierEnBase(echeancier, NOVEMBRE_2026, recul);
    expect(Date.parse(l!.instant_prevu)).toBe(finDuMoisMs(NOVEMBRE_2026 + 1) + recul);
  });
});
