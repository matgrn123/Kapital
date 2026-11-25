// Frise de l'année de jeu (page /calendrier). Aucune règle de jeu ici : on range dans les
// mois de l'année ce que la base sait déjà (échéances, livraisons, fins de bail) et ce que
// dit le calendrier de jeu (saisons, collections). Fonction pure, testée.

import { calendrierDuMois, type CollectionDuMois, type Saison } from "@kapital/engine";
import { cadreV1, libelleMoisDeJeu, nomCollection, NOMS_MOIS, type CadreCalendrier } from "./cadre";
import { formaterEuros } from "./formatage";

export type TypeEvenementFrise =
  | "collection"
  | "fin_de_bail"
  | "livraison"
  | "echeance_pret"
  | "cloture_exercice"
  | "fin_de_mois";

export type EvenementFrise = {
  readonly type: TypeEvenementFrise;
  /** Jour du mois de jeu (1 à 30). */
  readonly jour: number;
  readonly libelle: string;
};

export type EtatMois = "avant_le_monde" | "passe" | "en_cours" | "a_venir";

export type MoisFrise = {
  /** Mois de jeu (compté depuis 0) ; négatif si le monde n'était pas encore né. */
  readonly moisJeu: number;
  readonly nom: string;
  readonly saison: Saison | null;
  readonly collection: CollectionDuMois | null;
  readonly etat: EtatMois;
  readonly evenements: readonly EvenementFrise[];
};

export type EntreesFrise = {
  readonly moisCourant: number;
  /** Échéances à venir : payées à la clôture de leur mois de jeu. */
  readonly echeances: readonly { readonly mois: number; readonly mensualiteCentimes: number }[];
  /** Livraisons attendues, déjà placées dans un mois et un jour de jeu. */
  readonly livraisons: readonly { readonly mois: number; readonly jour: number; readonly libelle: string }[];
  /** Baux résiliés : le local est rendu au début de ce mois de jeu. */
  readonly finsDeBail: readonly { readonly mois: number; readonly libelle: string }[];
};

export type ElementPlusTard = { readonly moisJeu: number; readonly quand: string; readonly libelle: string };

export type Frise = {
  readonly annee: number;
  readonly mois: readonly MoisFrise[];
  /** Ce qui tombe après décembre, dans l'ordre. */
  readonly plusTard: readonly ElementPlusTard[];
};

const MOIS_PAR_AN = 12;

// Ordre d'affichage d'événements tombant le même jour.
const ORDRE: Record<TypeEvenementFrise, number> = {
  collection: 0,
  fin_de_bail: 1,
  livraison: 2,
  echeance_pret: 3,
  cloture_exercice: 4,
  fin_de_mois: 5,
};

/** Les événements datés que la base connaît, chacun avec son mois de jeu. */
function evenementsDates(entrees: EntreesFrise, cadre: CadreCalendrier) {
  const fin = cadre.joursParMois;
  return [
    ...entrees.livraisons.map((l) => ({ mois: l.mois, type: "livraison" as const, jour: l.jour, libelle: l.libelle })),
    ...entrees.echeances.map((e) => ({
      mois: e.mois,
      type: "echeance_pret" as const,
      jour: fin,
      libelle: `Échéance de prêt : ${formaterEuros(e.mensualiteCentimes)} €`,
    })),
    ...entrees.finsDeBail.map((b) => ({ mois: b.mois, type: "fin_de_bail" as const, jour: 1, libelle: b.libelle })),
  ];
}

export function friseDeLAnnee(entrees: EntreesFrise, cadre: CadreCalendrier = cadreV1()): Frise {
  const courant = calendrierDuMois(entrees.moisCourant, cadre.calendrier);
  const premier = entrees.moisCourant - (courant.moisCalendaire - 1);
  const dernier = premier + MOIS_PAR_AN - 1;
  const dates = evenementsDates(entrees, cadre);

  const mois: MoisFrise[] = Array.from({ length: MOIS_PAR_AN }, (_, i) => {
    const moisJeu = premier + i;
    const nom = NOMS_MOIS[i]!;
    if (moisJeu < 0) {
      return { moisJeu, nom, saison: null, collection: null, etat: "avant_le_monde", evenements: [] };
    }
    const c = calendrierDuMois(moisJeu, cadre.calendrier);
    const evenements: EvenementFrise[] = dates
      .filter((d) => d.mois === moisJeu)
      .map(({ type, jour, libelle }) => ({ type, jour, libelle }));
    if (c.moisCalendaire === cadre.calendrier.debutCollectionPE || c.moisCalendaire === cadre.calendrier.debutCollectionAH) {
      evenements.push({ type: "collection", jour: 1, libelle: `Nouvelle collection ${nomCollection(c.collection)}` });
    }
    // Même règle que moteur/cloture.ts : l'exercice de 12 mois se clôt aux mois 11, 23…
    if ((moisJeu + 1) % MOIS_PAR_AN === 0) {
      evenements.push({
        type: "cloture_exercice",
        jour: cadre.joursParMois,
        libelle: "Clôture de l'exercice : comptes annuels et impôt sur les sociétés",
      });
    }
    evenements.push({
      type: "fin_de_mois",
      jour: cadre.joursParMois,
      libelle: "Fin du mois : salaires, loyers et échéances",
    });
    evenements.sort((a, b) => a.jour - b.jour || ORDRE[a.type] - ORDRE[b.type]);
    const etat: EtatMois =
      moisJeu < entrees.moisCourant ? "passe" : moisJeu === entrees.moisCourant ? "en_cours" : "a_venir";
    return { moisJeu, nom, saison: c.saison, collection: c.collection, etat, evenements };
  });

  const plusTard = dates
    .filter((d) => d.mois > dernier)
    .sort((a, b) => a.mois - b.mois || a.jour - b.jour || ORDRE[a.type] - ORDRE[b.type])
    .map((d) => ({ moisJeu: d.mois, quand: libelleMoisDeJeu(d.mois, cadre), libelle: d.libelle }));

  return { annee: courant.annee, mois, plusTard };
}
