import type { Parametres } from "@kapital/content";

/**
 * Calendrier de jeu : traduit un mois de jeu (compté depuis 0, comme
 * `worlds.mois_courant`) en mois calendaire, année, saison et collection.
 *
 * - Le monde naît au mois calendaire `calendrier_mois_depart_monde` de l'an 1
 *   (janvier par défaut : l'exercice comptable de 12 mois, clos aux mois 11,
 *   23…, coïncide alors avec l'année civile). L'exercice comptable ne dépend
 *   pas de ce calendrier : seul l'affichage change.
 * - Les saisons suivent la convention météorologique (hiver = décembre à
 *   février, printemps = mars à mai, été = juin à août, automne = septembre à
 *   novembre) : c'est une convention du calendrier, pas un chiffre de jeu.
 * - Deux collections par an, printemps-été (PE) et automne-hiver (AH), qui
 *   commencent aux mois paramétrés. Avant le début du PE, on vend encore l'AH
 *   lancé l'année précédente. L'index de collection vaut 0 au mois 0 du monde
 *   et monte de 1 à chaque nouvelle collection : il ne décroît jamais.
 *
 * Fonction pure : ni horloge de la machine, ni hasard.
 */

export type Saison = "hiver" | "printemps" | "ete" | "automne";
export type TypeCollection = "PE" | "AH";

export type ConfigCalendrier = {
  /** Mois calendaire (1 à 12) du mois 0 du monde. */
  readonly moisDepartMonde: number;
  /** Mois calendaire (1 à 12) où commence la collection printemps-été. */
  readonly debutCollectionPE: number;
  /** Mois calendaire (1 à 12) où commence la collection automne-hiver. */
  readonly debutCollectionAH: number;
};

export type CollectionDuMois = {
  readonly type: TypeCollection;
  /** Année de jeu où la collection a commencé (0 pour l'AH en cours à la naissance du monde). */
  readonly anneeDebut: number;
  /** 0 au mois 0 du monde, +1 à chaque nouvelle collection. */
  readonly index: number;
};

export type CalendrierMois = {
  readonly moisJeu: number;
  /** 1 = janvier … 12 = décembre. */
  readonly moisCalendaire: number;
  /** Année de jeu, à partir de 1. */
  readonly annee: number;
  readonly saison: Saison;
  readonly collection: CollectionDuMois;
};

const MOIS_PAR_AN = 12;

function verifierMoisCalendaire(nom: string, valeur: number): void {
  if (!Number.isInteger(valeur) || valeur < 1 || valeur > MOIS_PAR_AN) {
    throw new Error(`${nom} : un mois calendaire va de 1 (janvier) à 12 (décembre), reçu ${valeur}.`);
  }
}

function verifierConfig(config: ConfigCalendrier): void {
  verifierMoisCalendaire("calendrier_mois_depart_monde", config.moisDepartMonde);
  verifierMoisCalendaire("calendrier_mois_debut_collection_pe", config.debutCollectionPE);
  verifierMoisCalendaire("calendrier_mois_debut_collection_ah", config.debutCollectionAH);
  if (config.debutCollectionPE >= config.debutCollectionAH) {
    throw new Error(
      `La collection printemps-été (mois ${config.debutCollectionPE}) doit commencer avant l'automne-hiver (mois ${config.debutCollectionAH}).`,
    );
  }
}

function lireMois(params: Parametres, cle: string): number {
  const p = params[cle];
  if (!p) throw new Error(`Paramètre manquant : ${cle}`);
  verifierMoisCalendaire(cle, p.valeur);
  return p.valeur;
}

export function configCalendrierDepuis(params: Parametres): ConfigCalendrier {
  const config = {
    moisDepartMonde: lireMois(params, "calendrier_mois_depart_monde"),
    debutCollectionPE: lireMois(params, "calendrier_mois_debut_collection_pe"),
    debutCollectionAH: lireMois(params, "calendrier_mois_debut_collection_ah"),
  };
  verifierConfig(config);
  return config;
}

function saisonDu(moisCalendaire: number): Saison {
  if (moisCalendaire === 12 || moisCalendaire <= 2) return "hiver";
  if (moisCalendaire <= 5) return "printemps";
  if (moisCalendaire <= 8) return "ete";
  return "automne";
}

/** Type et année de début de la collection en vente un mois calendaire donné. */
function collectionBrute(config: ConfigCalendrier, moisCalendaire: number, annee: number) {
  if (moisCalendaire >= config.debutCollectionAH) return { type: "AH" as const, anneeDebut: annee };
  if (moisCalendaire >= config.debutCollectionPE) return { type: "PE" as const, anneeDebut: annee };
  return { type: "AH" as const, anneeDebut: annee - 1 };
}

/** Rang absolu d'une collection : deux par an, PE puis AH. */
function rangCollection(c: { type: TypeCollection; anneeDebut: number }): number {
  return 2 * c.anneeDebut + (c.type === "AH" ? 1 : 0);
}

function position(mois: number, config: ConfigCalendrier) {
  const absolu = config.moisDepartMonde - 1 + mois;
  const moisCalendaire = (absolu % MOIS_PAR_AN) + 1;
  const annee = Math.floor(absolu / MOIS_PAR_AN) + 1;
  return { moisCalendaire, annee, brute: collectionBrute(config, moisCalendaire, annee) };
}

export function calendrierDuMois(mois: number, config: ConfigCalendrier): CalendrierMois {
  if (!Number.isInteger(mois) || mois < 0) {
    throw new Error(`Le mois de jeu doit être un entier >= 0, reçu ${mois}.`);
  }
  verifierConfig(config);
  const p = position(mois, config);
  const origine = position(0, config).brute;
  return {
    moisJeu: mois,
    moisCalendaire: p.moisCalendaire,
    annee: p.annee,
    saison: saisonDu(p.moisCalendaire),
    collection: {
      type: p.brute.type,
      anneeDebut: p.brute.anneeDebut,
      index: rangCollection(p.brute) - rangCollection(origine),
    },
  };
}
