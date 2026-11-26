import type { Parametres } from "@kapital/content";
import { creerRng, graineDepuis } from "../moteur/rng.js";
import type { ActionMarketing } from "../types/decision.js";
import type { EtapeEntreprise } from "../types/entreprise.js";
import { centimes, type Centimes } from "../types/primitifs.js";
import type {
  CoefficientsMarketing,
  DepenseMarketing,
  EffetMarketing,
  EtatJauges,
  ReglesActionMarketing,
} from "./types.js";

function borner(x: number): number {
  return Math.max(0, Math.min(100, x));
}

function montantEnEuros(montantCentimes: number): number {
  return montantCentimes / 100;
}

/** Les dix actions, dans l'ordre d'affichage. */
export const ACTIONS_MARKETING: readonly ActionMarketing[] = [
  "publicite",
  "image_marque",
  "promotion",
  "relations_presse",
  "reseaux_sociaux",
  "influenceur_nano",
  "influenceur_micro",
  "influenceur_macro",
  "affichage_metro",
  "agence_publicite",
];

/** Nom de chaque action dans les messages de refus. */
export const NOMS_ACTIONS_MARKETING: Readonly<Record<ActionMarketing, string>> = {
  publicite: "la publicité",
  image_marque: "l'image de marque",
  promotion: "la promotion",
  relations_presse: "les relations presse",
  reseaux_sociaux: "la publicité sur les réseaux sociaux",
  influenceur_nano: "un petit influenceur",
  influenceur_micro: "un influenceur moyen",
  influenceur_macro: "un gros influenceur",
  affichage_metro: "l'affichage dans le métro",
  agence_publicite: "une agence de publicité",
};

/** Honoraires prélevés sur le budget (agence), en centimes entiers. 0 pour les autres actions. */
export function honorairesMarketing(action: ActionMarketing, montant: Centimes, c: CoefficientsMarketing): Centimes {
  const taux = c.actions[action].tauxHonoraires;
  return centimes(taux > 0 ? Math.round(montant * taux) : 0);
}

/** Fourchette de l'aléa d'une action : [1 − amplitude, 1 + amplitude] ; {1, 1} sans aléa. */
export function fourchetteAlea(action: ActionMarketing, c: CoefficientsMarketing): { min: number; max: number } {
  const a = c.actions[action].amplitudeAlea;
  return a > 0 ? { min: 1 - a, max: 1 + a } : { min: 1, max: 1 };
}

/**
 * Aléa d'une action : 1 + amplitude × (2u − 1), avec u tiré de creerRng sur une graine déterministe
 * (société, mois de jeu, rang de l'action dans le mois). Même tirage, même aléa ; une deuxième
 * action dans le mois (rang suivant) donne un autre aléa. Exactement 1 pour une action sans aléa.
 */
export function aleaMarketing(
  action: ActionMarketing,
  c: CoefficientsMarketing,
  tirage: { readonly societe: string; readonly mois: number; readonly rang: number },
): number {
  const a = c.actions[action].amplitudeAlea;
  if (a <= 0) return 1;
  const u = creerRng(graineDepuis("marketing", tirage.societe, tirage.mois, tirage.rang))();
  return 1 + a * (2 * u - 1);
}

/**
 * Effet d'une dépense, piloté par la table des coefficients :
 * k × ln(1 + montant utile en euros) × aléa, où le montant utile est le budget moins les
 * honoraires (agence) et l'aléa est ramené dans sa fourchette (1 pour une action sans aléa).
 */
export function effetAction(
  depense: DepenseMarketing,
  c: CoefficientsMarketing,
): EffetMarketing {
  const r = c.actions[depense.action];
  const utile = depense.montant - honorairesMarketing(depense.action, depense.montant, c);
  const m = Math.log(1 + Math.max(0, montantEnEuros(utile)));
  const f = fourchetteAlea(depense.action, c);
  const alea = Math.max(f.min, Math.min(f.max, depense.alea ?? 1));
  return {
    deltaNotoriete: r.kNotoriete * m * alea,
    deltaDesirabilite: r.kDesirabilite * m * alea,
  };
}

export type RefusMarketing = {
  readonly ok: false;
  readonly code: "montant_invalide" | "montant_minimum" | "etape_insuffisante";
  readonly message: string;
};

function euros(c: number): string {
  return `${(c / 100).toFixed(2).replace(".", ",")} €`;
}

/**
 * Règles propres à chaque action, communes à l'aperçu du navigateur, à la route et à la
 * validation serveur : montant entier positif, au moins le minimum de l'action, étape atteinte
 * (affichage dans le métro). La trésorerie et le verrou de la publicité sont vérifiés à part.
 */
export function verifierActionMarketing(e: {
  readonly action: ActionMarketing;
  readonly montant: number;
  readonly etape: EtapeEntreprise | number;
  readonly coefficients: CoefficientsMarketing;
}): { readonly ok: true } | RefusMarketing {
  const r = e.coefficients.actions[e.action];
  if (!Number.isInteger(e.montant) || e.montant <= 0) {
    return { ok: false, code: "montant_invalide", message: "Indique un montant positif, en centimes entiers." };
  }
  if (r.etapeMinimum !== undefined && e.etape < r.etapeMinimum) {
    return {
      ok: false,
      code: "etape_insuffisante",
      message: `${majuscule(NOMS_ACTIONS_MARKETING[e.action])} se débloque à l'étape ${r.etapeMinimum} (tu es à l'étape ${e.etape}).`,
    };
  }
  if (e.montant < r.montantMinimum) {
    return {
      ok: false,
      code: "montant_minimum",
      message: `Pour ${NOMS_ACTIONS_MARKETING[e.action]}, le budget minimum est de ${euros(r.montantMinimum)} (tu proposes ${euros(e.montant)}).`,
    };
  }
  return { ok: true };
}

function majuscule(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function moisDeMarque(
  etatPrecedent: EtatJauges,
  depenses: readonly DepenseMarketing[],
  c: CoefficientsMarketing,
): EtatJauges {
  return fluxMarque(etatPrecedent, 1, depenses, c);
}

// Version continue : applique la décroissance exponentielle sur `dureeMois`
// (peut être fractionnaire) puis les effets ponctuels des dépenses.
export function fluxMarque(
  etatPrecedent: EtatJauges,
  dureeMois: number,
  depenses: readonly DepenseMarketing[],
  c: CoefficientsMarketing,
): EtatJauges {
  if (dureeMois < 0) {
    throw new Error(`dureeMois doit être >= 0, reçu ${dureeMois}.`);
  }
  let noto = etatPrecedent.notoriete * Math.exp(-c.decroissanceNotoriete * dureeMois);
  let desi = etatPrecedent.desirabilite * Math.exp(-c.decroissanceDesirabilite * dureeMois);
  for (const d of depenses) {
    const e = effetAction(d, c);
    noto += e.deltaNotoriete;
    desi += e.deltaDesirabilite;
  }
  return {
    notoriete: borner(noto),
    desirabilite: borner(desi),
  };
}

export function coefficientsMarketingDepuisParametres(
  params: Parametres,
): CoefficientsMarketing {
  const lire = (cle: string): number => {
    const p = params[cle];
    if (!p) throw new Error(`Paramètre manquant : ${cle}`);
    return p.valeur;
  };
  const amplitude = (cle: string): number => {
    const a = lire(cle);
    if (!(a >= 0 && a < 1)) throw new Error(`${cle} doit être entre 0 et 1 (exclu), reçu ${a}.`);
    return a;
  };
  const etape = (cle: string): EtapeEntreprise => {
    const n = lire(cle);
    if (n !== 0 && n !== 1 && n !== 2 && n !== 3) throw new Error(`${cle} doit être une étape de 0 à 3, reçu ${n}.`);
    return n;
  };
  // Les quatre actions d'origine : leurs k historiques, aucun minimum au-delà d'un centime
  // (montant strictement positif), aucun aléa, aucun honoraire.
  const origine = (kNotoriete: number, kDesirabilite: number): ReglesActionMarketing => ({
    kNotoriete,
    kDesirabilite,
    montantMinimum: centimes(1),
    amplitudeAlea: 0,
    tauxHonoraires: 0,
  });
  const nouvelle = (suffixe: string, extra: Partial<ReglesActionMarketing> = {}): ReglesActionMarketing => ({
    kNotoriete: lire(`marketing_k_notoriete_${suffixe}`),
    kDesirabilite: lire(`marketing_k_desirabilite_${suffixe}`),
    montantMinimum: centimes(lire(`marketing_montant_min_${suffixe}`)),
    amplitudeAlea: 0,
    tauxHonoraires: 0,
    ...extra,
  });
  const kNotorietePublicite = lire("marketing_k_notoriete_publicite");
  const kDesirabiliteImage = lire("marketing_k_desirabilite_image");
  const kNotorietePromotion = lire("marketing_k_notoriete_promotion");
  const kDesirabilitePromotionNegatif = lire("marketing_k_desirabilite_promotion_negatif");
  const kNotorieteRp = lire("marketing_k_notoriete_rp");
  const kDesirabiliteRp = lire("marketing_k_desirabilite_rp");
  return {
    kNotorietePublicite,
    kDesirabiliteImage,
    kNotorietePromotion,
    kDesirabilitePromotionNegatif,
    kNotorieteRp,
    kDesirabiliteRp,
    decroissanceNotoriete: lire("decroissance_notoriete_mois"),
    decroissanceDesirabilite: lire("decroissance_desirabilite_mois"),
    actions: {
      publicite: origine(kNotorietePublicite, 0),
      image_marque: origine(0, kDesirabiliteImage),
      promotion: origine(kNotorietePromotion, -kDesirabilitePromotionNegatif),
      relations_presse: origine(kNotorieteRp, kDesirabiliteRp),
      reseaux_sociaux: nouvelle("reseaux_sociaux", {
        coutPourMilleAffichages: centimes(lire("marketing_cpm_reseaux_sociaux")),
      }),
      influenceur_nano: nouvelle("influenceur_nano", {
        amplitudeAlea: amplitude("marketing_alea_amplitude_influenceur_nano"),
      }),
      influenceur_micro: nouvelle("influenceur_micro", {
        amplitudeAlea: amplitude("marketing_alea_amplitude_influenceur_micro"),
      }),
      influenceur_macro: nouvelle("influenceur_macro", {
        amplitudeAlea: amplitude("marketing_alea_amplitude_influenceur_macro"),
      }),
      affichage_metro: nouvelle("affichage_metro", {
        etapeMinimum: etape("marketing_etape_min_affichage_metro"),
      }),
      agence_publicite: nouvelle("agence_publicite", {
        tauxHonoraires: lire("marketing_honoraires_agence_taux"),
      }),
    },
  };
}
