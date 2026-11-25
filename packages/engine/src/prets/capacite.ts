import type { Parametres } from "@kapital/content";
import type { ObjetPret } from "../types/entreprise.js";
import { centimes, type Centimes } from "../types/primitifs.js";

// AE-4 : capacité d'emprunt. Fonctions pures ; tous les chiffres viennent des
// paramètres sourcés (pret_*). Taux d'un prêt = €STR du mois + marge selon l'objet
// (cahier des charges section 6).

export class ErreurPrets extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurPrets";
  }
}

export const OBJETS_PRET: readonly ObjetPret[] = ["tresorerie", "equipement", "immobilier"];

export function estObjetPret(x: unknown): x is ObjetPret {
  return typeof x === "string" && (OBJETS_PRET as readonly string[]).includes(x);
}

export type RegleObjetPret = {
  /** Marge de la banque au-dessus de l'€STR (ratio annuel). */
  readonly margeSurEstr: number;
  readonly dureeMinMois: number;
  readonly dureeMaxMois: number;
  /** Montant maximal d'un prêt pour cet objet. */
  readonly plafondMontant: Centimes;
  /** La dette totale après prêt ne doit pas dépasser ce multiple de la trésorerie. */
  readonly plafondEndettementMultipleTresorerie: number;
};

export type ReglesPret = {
  readonly parObjet: Readonly<Record<ObjetPret, RegleObjetPret>>;
  /** €STR annuel utilisé si la table market_data n'en donne aucun. */
  readonly estrDeSecoursAnnuel: number;
};

function lire(params: Parametres, cle: string): number {
  const p = params[cle];
  if (!p) throw new ErreurPrets(`Paramètre manquant : ${cle}.`);
  if (!Number.isFinite(p.valeur)) {
    throw new ErreurPrets(`Paramètre ${cle} : valeur invalide (${p.valeur}).`);
  }
  return p.valeur;
}

function positif(params: Parametres, cle: string): number {
  const v = lire(params, cle);
  if (v <= 0) throw new ErreurPrets(`${cle} doit être strictement positif, reçu ${v}.`);
  return v;
}

function entierPositif(params: Parametres, cle: string): number {
  const v = positif(params, cle);
  if (!Number.isInteger(v)) throw new ErreurPrets(`${cle} doit être un entier, reçu ${v}.`);
  return v;
}

function regleDepuis(params: Parametres, objet: ObjetPret): RegleObjetPret {
  const dureeMinMois = entierPositif(params, `pret_duree_min_mois_${objet}`);
  const dureeMaxMois = entierPositif(params, `pret_duree_max_mois_${objet}`);
  if (dureeMaxMois < dureeMinMois) {
    throw new ErreurPrets(
      `Prêt ${objet} : durée maximale (${dureeMaxMois}) inférieure à la durée minimale (${dureeMinMois}).`,
    );
  }
  return {
    margeSurEstr: positif(params, `pret_marge_estr_${objet}`),
    dureeMinMois,
    dureeMaxMois,
    plafondMontant: centimes(entierPositif(params, `pret_plafond_montant_centimes_${objet}`)),
    plafondEndettementMultipleTresorerie: positif(params, `pret_plafond_endettement_multiple_tresorerie_${objet}`),
  };
}

export function reglesPretDepuis(params: Parametres): ReglesPret {
  const estr = lire(params, "pret_estr_secours_annuel");
  if (estr < 0) throw new ErreurPrets(`pret_estr_secours_annuel ne peut pas être négatif, reçu ${estr}.`);
  return {
    parObjet: {
      tresorerie: regleDepuis(params, "tresorerie"),
      equipement: regleDepuis(params, "equipement"),
      immobilier: regleDepuis(params, "immobilier"),
    },
    estrDeSecoursAnnuel: estr,
  };
}

/** Taux annuel d'un prêt : €STR du mois (plancher à 0) + marge de l'objet. */
export function tauxPret(objet: ObjetPret, tauxEstrAnnuel: number, regles: ReglesPret): number {
  return Math.max(tauxEstrAnnuel, 0) + regles.parObjet[objet].margeSurEstr;
}

/** Ce que la décision lit de l'entreprise. */
export type SituationEmprunt = {
  readonly tresorerie: Centimes;
  /** Somme des capitaux restants dus des prêts en cours. */
  readonly detteEnCours: Centimes;
};

export type CapaciteEmprunt = {
  readonly objet: ObjetPret;
  readonly detteEnCours: Centimes;
  /** Dette totale maximale (multiple de la trésorerie, 1 centime au minimum). */
  readonly plafondEndettement: Centimes;
  /** Ce qu'il reste à emprunter avant d'atteindre le plafond d'endettement. */
  readonly margeEndettement: Centimes;
  readonly plafondMontantParPret: Centimes;
  /** Plus gros prêt accordé aujourd'hui pour cet objet. */
  readonly montantMaximal: Centimes;
  readonly dureeMinMois: number;
  readonly dureeMaxMois: number;
};

export function capaciteEmprunt(
  situation: SituationEmprunt,
  objet: ObjetPret,
  regles: ReglesPret,
): CapaciteEmprunt {
  const r = regles.parObjet[objet];
  const plafondEndettement = Math.round(Math.max(situation.tresorerie, 1) * r.plafondEndettementMultipleTresorerie);
  const margeEndettement = Math.max(plafondEndettement - situation.detteEnCours, 0);
  return {
    objet,
    detteEnCours: situation.detteEnCours,
    plafondEndettement: centimes(plafondEndettement),
    margeEndettement: centimes(margeEndettement),
    plafondMontantParPret: r.plafondMontant,
    montantMaximal: centimes(Math.min(r.plafondMontant, margeEndettement)),
    dureeMinMois: r.dureeMinMois,
    dureeMaxMois: r.dureeMaxMois,
  };
}

export type DemandePretEvaluee = {
  readonly objet: ObjetPret;
  readonly montant: Centimes;
  readonly dureeMois: number;
};

export type Depassement = {
  /** Le plafond qui joue : dette totale permise, ou plafond du prêt. */
  readonly plafond: number;
  /** Ce qui est demandé, comparé à ce plafond (dette totale après prêt, ou montant du prêt). */
  readonly demande: number;
  readonly manque: number;
};

export type CodeRefusPret =
  | "montant_invalide"
  | "duree_hors_bornes"
  | "endettement_excessif"
  | "plafond_pret_depasse";

export type EvaluationDemandePret =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: CodeRefusPret;
      readonly message: string;
      readonly depassement?: Depassement;
    };

function euros(c: number): string {
  return `${(c / 100).toFixed(2).replace(".", ",")} €`;
}

const LIBELLE_OBJET: Readonly<Record<ObjetPret, string>> = {
  tresorerie: "de trésorerie",
  equipement: "d'équipement",
  immobilier: "immobilier",
};

export function evaluerDemandePret(
  situation: SituationEmprunt,
  d: DemandePretEvaluee,
  regles: ReglesPret,
): EvaluationDemandePret {
  const cap = capaciteEmprunt(situation, d.objet, regles);
  const libelle = LIBELLE_OBJET[d.objet];
  if (!Number.isInteger(d.montant) || d.montant <= 0) {
    return {
      ok: false,
      code: "montant_invalide",
      message: `Le montant demandé doit être un nombre entier de centimes strictement positif (reçu ${d.montant} centimes).`,
    };
  }
  if (!Number.isInteger(d.dureeMois) || d.dureeMois < cap.dureeMinMois || d.dureeMois > cap.dureeMaxMois) {
    return {
      ok: false,
      code: "duree_hors_bornes",
      message: `La durée d'un prêt ${libelle} doit être comprise entre ${cap.dureeMinMois} et ${cap.dureeMaxMois} mois (reçu ${d.dureeMois}).`,
    };
  }
  const detteApres = situation.detteEnCours + d.montant;
  if (detteApres > cap.plafondEndettement) {
    const manque = detteApres - cap.plafondEndettement;
    return {
      ok: false,
      code: "endettement_excessif",
      message: `Dette totale après prêt ${libelle} : ${euros(detteApres)}, au-dessus du plafond de ${euros(cap.plafondEndettement)} (${regles.parObjet[d.objet].plafondEndettementMultipleTresorerie} fois votre trésorerie de ${euros(Math.max(situation.tresorerie, 0))}), soit ${euros(manque)} de trop. Vous pouvez encore emprunter ${euros(cap.margeEndettement)}.`,
      depassement: { plafond: cap.plafondEndettement, demande: detteApres, manque },
    };
  }
  if (d.montant > cap.plafondMontantParPret) {
    const manque = d.montant - cap.plafondMontantParPret;
    return {
      ok: false,
      code: "plafond_pret_depasse",
      message: `Un prêt ${libelle} est limité à ${euros(cap.plafondMontantParPret)} : votre demande de ${euros(d.montant)} dépasse de ${euros(manque)}.`,
      depassement: { plafond: cap.plafondMontantParPret, demande: d.montant, manque },
    };
  }
  return { ok: true };
}
