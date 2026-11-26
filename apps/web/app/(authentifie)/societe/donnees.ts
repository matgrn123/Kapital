// Lecture seule pour les écrans Société et Magasin : on relit le grand livre et
// les étapes du moteur (@kapital/engine), sans aucun seuil écrit ici.

import {
  DEBLOCAGES_PAR_ACTION,
  centimes,
  conditionsManquantes,
  type ActionVerrouillable,
  type ConditionManquante,
  type EtapeEntreprise,
  type SeuilsEtapes,
} from "@kapital/engine";
import type { LigneEcriture } from "../../../components/ui/calculs";
import { libelleMois } from "../../../lib/cadre";
import { formaterEuros } from "../../../lib/formatage";
import type { LigneGrandLivre } from "../../../lib/tableau";

type Ligne = Pick<LigneGrandLivre, "ecriture_id" | "compte" | "sens" | "montant_centimes" | "libelle">;

/** Solde créditeur du compte 101 (capital social), ou null s'il n'y a aucune écriture. */
export function capitalSocial(lignes: readonly Ligne[]): number | null {
  const du101 = lignes.filter((l) => l.compte === "101");
  if (du101.length === 0) return null;
  return du101.reduce((s, l) => s + (l.sens === "credit" ? l.montant_centimes : -l.montant_centimes), 0);
}

/**
 * L'écriture d'ouverture réelle (apport 512 / 101), telle qu'enregistrée, avec son mois
 * (index de mois) et l'étiquette à afficher (« novembre 2026 ») quand le mois est connu.
 */
export function ecritureOuverture(
  lignes: readonly (Ligne & { readonly mois_jeu?: number | null })[],
): { libelle: string; mois: number | null; etiquette?: string; lignes: LigneEcriture[] } | null {
  const apport = lignes.filter((l) => l.ecriture_id === "apport_initial");
  if (apport.length === 0) return null;
  const moisLu = apport[0]!.mois_jeu;
  const mois = typeof moisLu === "number" && Number.isFinite(moisLu) ? moisLu : null;
  return {
    libelle: apport[0]!.libelle,
    mois,
    ...(mois === null ? {} : { etiquette: libelleMois(mois) }),
    lignes: apport.map((l) =>
      l.sens === "debit" ? { compte: l.compte, debit: l.montant_centimes } : { compte: l.compte, credit: l.montant_centimes },
    ),
  };
}

export const INTITULES_ETAPES: Record<EtapeEntreprise, string> = {
  0: "L'idée",
  1: "Le lancement",
  2: "L'atelier",
  3: "La boutique",
};

const LIBELLES_ACTIONS: Record<ActionVerrouillable, string> = {
  action_marketing: "la publicité",
  demande_pret: "l'emprunt",
  louer_atelier: "la location d'un local",
  achat_local: "l'achat d'un local",
  production_atelier: "la production à l'atelier",
  embauche: "l'embauche",
  vente_revendeur: "la vente aux revendeurs",
  ouverture_boutique: "l'ouverture d'une boutique",
};

/** Libellés des actions verrouillables, pour la carte d'étape du tableau de bord. */
export function libelleAction(a: ActionVerrouillable): string {
  return LIBELLES_ACTIONS[a];
}

const euros = (c: number) => `${formaterEuros(c)} €`;

export type EtapeDuJeu = { etape: EtapeEntreprise; intitule: string; condition: string; debloque: string[] };

/** Les étapes du jeu : seuils lus dans les paramètres, déblocages lus dans le moteur. */
export function etapesDuJeu(seuils: SeuilsEtapes): EtapeDuJeu[] {
  const debloque = (e: EtapeEntreprise) =>
    (Object.keys(DEBLOCAGES_PAR_ACTION) as ActionVerrouillable[])
      .filter((a) => DEBLOCAGES_PAR_ACTION[a] === e)
      .map((a) => LIBELLES_ACTIONS[a]);
  return [
    {
      etape: 0,
      intitule: INTITULES_ETAPES[0],
      condition: "Dès la création de la société.",
      debloque: ["fixer tes prix en ligne", "acheter la matière", "faire produire chez un façonnier"],
    },
    {
      etape: 1,
      intitule: INTITULES_ETAPES[1],
      condition: `${seuils.piecesEtape1} pièces vendues au total.`,
      debloque: debloque(1),
    },
    {
      etape: 2,
      intitule: INTITULES_ETAPES[2],
      condition: `${euros(seuils.chiffreAffairesHtEtape2)} de chiffre d'affaires hors taxes cumulé, et une trésorerie positive à la clôture du mois.`,
      debloque: debloque(2),
    },
    {
      etape: 3,
      intitule: INTITULES_ETAPES[3],
      condition: `${euros(seuils.chiffreAffairesHtEtape3)} de chiffre d'affaires hors taxes cumulé, au moins ${euros(seuils.tresorerieMinimaleEtape3)} de trésorerie à la clôture du mois et ${seuils.notorieteMinimaleEtape3} points de notoriété.`,
      debloque: [...debloque(3), "l'embauche de vendeurs"],
    },
  ];
}

export type ConditionJauge = {
  cle: ConditionManquante["cle"];
  libelle: string;
  valeur: number;
  max: number;
  texte: string;
  remplie: boolean;
};

const points = (n: number) => String(Math.floor(n));

/**
 * Conditions de l'étape 3 (la boutique), lues dans le moteur : chiffre d'affaires cumulé,
 * trésorerie à la clôture et notoriété. Une fois l'étape 3 atteinte, elles sont acquises
 * (l'étape ne redescend jamais), même si la trésorerie ou la notoriété baissent ensuite.
 */
export function conditionsBoutique(
  e: {
    etape: EtapeEntreprise;
    piecesVendues: number;
    chiffreAffairesHt: number;
    tresorerie: number;
    notoriete: number;
  },
  seuils: SeuilsEtapes,
): ConditionJauge[] {
  const manquantes =
    e.etape >= 3
      ? []
      : conditionsManquantes(
          3,
          {
            etape: e.etape,
            cumuls: { piecesVendues: e.piecesVendues, chiffreAffairesHt: centimes(e.chiffreAffairesHt) },
            tresorerie: centimes(e.tresorerie),
            notoriete: e.notoriete,
          },
          seuils,
        );
  const rempli = (cle: ConditionManquante["cle"]) => !manquantes.some((m) => m.cle === cle);
  return [
    {
      cle: "chiffre_affaires_ht_cumule",
      libelle: "Chiffre d'affaires hors taxes cumulé",
      valeur: Math.max(0, Math.min(e.chiffreAffairesHt, seuils.chiffreAffairesHtEtape3)),
      max: seuils.chiffreAffairesHtEtape3,
      texte: `${euros(e.chiffreAffairesHt)} / ${euros(seuils.chiffreAffairesHtEtape3)}`,
      remplie: rempli("chiffre_affaires_ht_cumule"),
    },
    {
      cle: "tresorerie_minimale",
      libelle: "Trésorerie à la clôture du mois",
      valeur: Math.max(0, Math.min(e.tresorerie, seuils.tresorerieMinimaleEtape3)),
      max: seuils.tresorerieMinimaleEtape3,
      texte: `${euros(e.tresorerie)} / ${euros(seuils.tresorerieMinimaleEtape3)}`,
      remplie: rempli("tresorerie_minimale"),
    },
    {
      cle: "notoriete",
      libelle: "Notoriété de la marque",
      valeur: Math.max(0, Math.min(e.notoriete, seuils.notorieteMinimaleEtape3)),
      max: seuils.notorieteMinimaleEtape3,
      texte: `${points(e.notoriete)} / ${seuils.notorieteMinimaleEtape3} points`,
      remplie: rempli("notoriete"),
    },
  ];
}
