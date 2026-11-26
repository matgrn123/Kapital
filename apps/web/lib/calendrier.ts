// Frise des 12 mois à venir (page /calendrier), à partir du mois en cours : elle glisse avec
// le temps, l'année change en janvier. Aucune règle de jeu ici : on range dans les vrais mois
// ce que la base sait déjà (échéances, livraisons, fins de bail), les saisons et les
// collections de la mode. Fonction pure, testée.

import { chargerParametresV1, type Parametres } from "@kapital/content";
import {
  estIndexCalendaire,
  indexDeMois,
  joursDansLeMois,
  libelleMois,
  moisCivil,
  NOMS_MOIS,
  NOMS_MOIS_COURTS,
  partiesParis,
  periodeMois,
  positionDeLInstant,
} from "./cadre";
import { formaterEuros } from "./formatage";

/* ------------------------------------------------- Saisons et collections */

export type Saison = "hiver" | "printemps" | "ete" | "automne";

export const NOMS_SAISONS: Record<Saison, string> = {
  hiver: "Hiver",
  printemps: "Printemps",
  ete: "Été",
  automne: "Automne",
};

/** Saisons météorologiques : hiver = décembre à février, printemps = mars à mai, etc. */
export function saisonDuMois(moisCivil: number): Saison {
  if (moisCivil === 12 || moisCivil <= 2) return "hiver";
  if (moisCivil <= 5) return "printemps";
  if (moisCivil <= 8) return "ete";
  return "automne";
}

export type ConfigCollections = {
  /** Mois civil (1 à 12) où arrive la collection printemps-été. */
  readonly debutPE: number;
  /** Mois civil (1 à 12) où arrive la collection automne-hiver. */
  readonly debutAH: number;
};

function lireMoisCivil(params: Parametres, cle: string): number {
  const v = params[cle]?.valeur;
  if (v === undefined || !Number.isInteger(v) || v < 1 || v > 12) {
    throw new Error(`Paramètre ${cle} manquant ou invalide : un mois va de 1 (janvier) à 12 (décembre).`);
  }
  return v;
}

export function configCollectionsDepuis(params: Parametres): ConfigCollections {
  const debutPE = lireMoisCivil(params, "calendrier_mois_debut_collection_pe");
  const debutAH = lireMoisCivil(params, "calendrier_mois_debut_collection_ah");
  if (debutPE >= debutAH) {
    throw new Error(`La collection printemps-été (mois ${debutPE}) doit arriver avant l'automne-hiver (mois ${debutAH}).`);
  }
  return { debutPE, debutAH };
}

let configParDefaut: ConfigCollections | null = null;
function configV1(): ConfigCollections {
  configParDefaut ??= configCollectionsDepuis(chargerParametresV1());
  return configParDefaut;
}

export type Collection = { readonly type: "PE" | "AH"; readonly annee: number };

/** Collection en boutique un mois donné : avant février, on vend encore l'automne-hiver de l'an passé. */
export function collectionDuMois(annee: number, mois: number, config: ConfigCollections): Collection {
  if (mois >= config.debutAH) return { type: "AH", annee };
  if (mois >= config.debutPE) return { type: "PE", annee };
  return { type: "AH", annee: annee - 1 };
}

export function nomCollection(c: Collection): string {
  return `${c.type === "PE" ? "printemps-été" : "automne-hiver"} ${c.annee}`;
}

/* -------------------------------------------------------------------- Frise */

export type TypeEvenementFrise =
  | "collection"
  | "fin_de_bail"
  | "livraison"
  | "echeance_pret"
  | "cloture_exercice"
  | "fin_de_mois";

export type EvenementFrise = {
  readonly type: TypeEvenementFrise;
  /** Jour du mois (1 à 31). */
  readonly jour: number;
  readonly libelle: string;
};

export type EtatMois = "en_cours" | "a_venir";

export type MoisFrise = {
  /** Index du mois (année × 12 + mois civil − 1). */
  readonly index: number;
  readonly annee: number;
  /** « juin » */
  readonly nom: string;
  /** Abréviation sans ambiguïté : « juin », « juil. », « sept. ». */
  readonly abrege: string;
  /** Nombre de jours du mois (28 à 31). */
  readonly jours: number;
  readonly saison: Saison;
  readonly collection: Collection;
  readonly etat: EtatMois;
  readonly evenements: readonly EvenementFrise[];
};

export type EntreesFrise = {
  /** Instant du jeu (lib/cadre › instantDuJeu) : il fixe le mois en cours, premier mois de la frise. */
  readonly maintenantJeuMs: number;
  /** Échéances à venir : payées à la fin de leur mois (mois_jeu), ou à leur instant prévu pour l'ancien compteur. */
  readonly echeances: readonly {
    readonly moisJeu: number | null;
    readonly instantPrevu: string | null;
    readonly mensualiteCentimes: number;
  }[];
  /** Livraisons attendues (matière, production), à leur instant prévu. */
  readonly livraisons: readonly { readonly instant: string; readonly libelle: string }[];
  /** Baux résiliés : le local est rendu au début de ce mois (index). */
  readonly finsDeBail: readonly { readonly mois: number; readonly libelle: string }[];
};

export type ElementDate = { readonly quand: string; readonly libelle: string };

/** Nombre de mois montrés par la frise, mois en cours compris. */
export const MOIS_DANS_LA_FRISE = 12;

export type Frise = {
  /** « novembre 2026 à octobre 2027 ». */
  readonly periode: string;
  readonly aujourdhui: { readonly mois: number; readonly jour: number };
  readonly mois: readonly MoisFrise[];
  /** Ce qui était prévu avant le mois en cours et n'a pas encore eu lieu (livraison en retard…). */
  readonly enRetard: readonly ElementDate[];
  /** Ce qui tombe après le dernier mois de la frise, puis ce qui n'a pas encore de vraie date, dans l'ordre. */
  readonly plusTard: readonly ElementDate[];
};

// Ordre d'affichage d'événements tombant le même jour.
const ORDRE: Record<TypeEvenementFrise, number> = {
  collection: 0,
  fin_de_bail: 1,
  livraison: 2,
  echeance_pret: 3,
  cloture_exercice: 4,
  fin_de_mois: 5,
};

type EvenementDate = EvenementFrise & { readonly mois: number };

function dernierJour(index: number): number {
  const c = moisCivil(index)!;
  return joursDansLeMois(c.annee, c.mois);
}

/** Les événements que la base connaît, chacun à son mois et à son jour ; à part, ceux sans vraie date. */
function evenementsDates(entrees: EntreesFrise): { dates: EvenementDate[]; sansDate: EvenementDate[] } {
  const dates: EvenementDate[] = [];
  const sansDate: EvenementDate[] = [];

  for (const l of entrees.livraisons) {
    const ms = Date.parse(l.instant);
    if (!Number.isFinite(ms)) continue;
    dates.push({ ...positionDeLInstant(ms), type: "livraison", libelle: l.libelle });
  }
  for (const e of entrees.echeances) {
    const libelle = `Échéance de prêt : ${formaterEuros(e.mensualiteCentimes)} €`;
    if (e.moisJeu !== null && estIndexCalendaire(e.moisJeu)) {
      dates.push({ mois: e.moisJeu, jour: dernierJour(e.moisJeu), type: "echeance_pret", libelle });
      continue;
    }
    const ms = e.instantPrevu ? Date.parse(e.instantPrevu) : Number.NaN;
    if (Number.isFinite(ms)) dates.push({ ...positionDeLInstant(ms), type: "echeance_pret", libelle });
  }
  for (const b of entrees.finsDeBail) {
    const ev = { mois: b.mois, jour: 1, type: "fin_de_bail" as const, libelle: b.libelle };
    (estIndexCalendaire(b.mois) ? dates : sansDate).push(ev);
  }
  return { dates, sansDate };
}

function trier(a: EvenementDate, b: EvenementDate): number {
  return a.mois - b.mois || a.jour - b.jour || ORDRE[a.type] - ORDRE[b.type];
}

function quandLisible(d: EvenementDate): string {
  return `${d.jour === 1 ? "1er" : d.jour} ${libelleMois(d.mois)}`;
}

export function friseDesDouzeMois(entrees: EntreesFrise, config: ConfigCollections = configV1()): Frise {
  const auj = partiesParis(entrees.maintenantJeuMs);
  const moisCourant = indexDeMois(auj.annee, auj.mois);
  const dernier = moisCourant + MOIS_DANS_LA_FRISE - 1;
  const { dates, sansDate } = evenementsDates(entrees);

  const mois: MoisFrise[] = Array.from({ length: MOIS_DANS_LA_FRISE }, (_, i) => {
    const index = moisCourant + i;
    const { annee, mois: civil } = moisCivil(index)!;
    const jours = joursDansLeMois(annee, civil);
    const collection = collectionDuMois(annee, civil, config);
    const evenements: EvenementFrise[] = dates
      .filter((d) => d.mois === index)
      .map(({ type, jour, libelle }) => ({ type, jour, libelle }));
    if (civil === config.debutPE || civil === config.debutAH) {
      evenements.push({ type: "collection", jour: 1, libelle: `Nouvelle collection ${nomCollection(collection)}` });
    }
    // L'exercice comptable suit l'année civile : il se clôt le 31 décembre.
    if (civil === 12) {
      evenements.push({
        type: "cloture_exercice",
        jour: jours,
        libelle: "Clôture de l'exercice : comptes annuels et impôt sur les sociétés",
      });
    }
    evenements.push({ type: "fin_de_mois", jour: jours, libelle: "Fin du mois : salaires, loyers et échéances" });
    evenements.sort((a, b) => a.jour - b.jour || ORDRE[a.type] - ORDRE[b.type]);
    return {
      index,
      annee,
      nom: NOMS_MOIS[civil - 1]!,
      abrege: NOMS_MOIS_COURTS[civil - 1]!,
      jours,
      saison: saisonDuMois(civil),
      collection,
      etat: i === 0 ? "en_cours" : "a_venir",
      evenements,
    };
  });

  const enRetard: ElementDate[] = dates
    .filter((d) => d.mois < moisCourant)
    .sort(trier)
    .map((d) => ({ quand: quandLisible(d), libelle: d.libelle }));
  const plusTard: ElementDate[] = [
    ...dates
      .filter((d) => d.mois > dernier)
      .sort(trier)
      .map((d) => ({ quand: quandLisible(d), libelle: d.libelle })),
    ...sansDate.sort(trier).map((d) => ({ quand: libelleMois(d.mois), libelle: d.libelle })),
  ];

  return {
    periode: periodeMois(moisCourant, dernier) ?? libelleMois(moisCourant),
    aujourdhui: { mois: moisCourant, jour: auj.jour },
    mois,
    enRetard,
    plusTard,
  };
}
