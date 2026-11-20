import type { Parametres } from "@kapital/content";
import type { DecisionsEntreprise } from "../types/decision.js";
import type { MarketInputs } from "../types/marketInputs.js";
import type {
  Graine,
  InstantJeu,
} from "../types/primitifs.js";
import { simulerDepuis } from "../moteur/simulate.js";
import { appliquerEvenement } from "./handlers.js";
import type { EtatMonde, EvenementPlanifie } from "./types.js";

export type EntreesAvancer = {
  readonly etat: EtatMonde;
  readonly decisions: readonly DecisionsEntreprise[];
  readonly marketInputs: MarketInputs;
  readonly params: Parametres;
  readonly instantFin: InstantJeu;
  readonly graine: Graine;
};

export type ResultatAvancer = {
  readonly nouvelEtat: EtatMonde;
  readonly evenementsExecutes: readonly EvenementPlanifie[];
};

function trieEvenements(
  evs: readonly EvenementPlanifie[],
): readonly EvenementPlanifie[] {
  return [...evs].sort((a, b) => {
    if (a.instant !== b.instant) return a.instant - b.instant;
    return a.id.localeCompare(b.id);
  });
}

export function avancer(e: EntreesAvancer): ResultatAvancer {
  if (e.instantFin < e.etat.instantCourant) {
    throw new Error(
      `instantFin (${e.instantFin}) doit être >= instantCourant (${e.etat.instantCourant}).`,
    );
  }

  const tries = trieEvenements(e.etat.evenementsPlanifies);
  const aExecuter = tries.filter(
    (ev) => ev.instant >= e.etat.instantCourant && ev.instant <= e.instantFin,
  );
  const restants = tries.filter((ev) => ev.instant > e.instantFin);

  let monde = e.etat.monde;
  let grandLivres = e.etat.grandLivres;
  let instantCourant = e.etat.instantCourant;

  for (const ev of aExecuter) {
    // 1. Avance les flux continus de instantCourant à ev.instant
    if (ev.instant > instantCourant) {
      const r = simulerDepuis({
        monde,
        decisions: e.decisions,
        marketInputs: e.marketInputs,
        params: e.params,
        instantDebut: instantCourant,
        instantFin: ev.instant,
        graine: e.graine,
      });
      monde = r.nouveauMonde;
    }
    // 2. Applique l'événement
    const r = appliquerEvenement(monde, grandLivres, ev);
    monde = r.monde;
    grandLivres = r.grandLivres;
    instantCourant = ev.instant;
  }

  // 3. Flux continus jusqu'à instantFin après le dernier événement
  if (e.instantFin > instantCourant) {
    const r = simulerDepuis({
      monde,
      decisions: e.decisions,
      marketInputs: e.marketInputs,
      params: e.params,
      instantDebut: instantCourant,
      instantFin: e.instantFin,
      graine: e.graine,
    });
    monde = r.nouveauMonde;
  }

  return {
    nouvelEtat: {
      instantCourant: e.instantFin,
      monde,
      grandLivres,
      evenementsPlanifies: restants,
    },
    evenementsExecutes: aExecuter,
  };
}
