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
import { formaterEuros } from "../../../lib/formatage";
import type { LigneGrandLivre } from "../../../lib/tableau";

type Ligne = Pick<LigneGrandLivre, "ecriture_id" | "compte" | "sens" | "montant_centimes" | "libelle">;

/** Solde créditeur du compte 101 (capital social), ou null s'il n'y a aucune écriture. */
export function capitalSocial(lignes: readonly Ligne[]): number | null {
  const du101 = lignes.filter((l) => l.compte === "101");
  if (du101.length === 0) return null;
  return du101.reduce((s, l) => s + (l.sens === "credit" ? l.montant_centimes : -l.montant_centimes), 0);
}

/** L'écriture d'ouverture réelle (apport 512 / 101), telle qu'enregistrée. */
export function ecritureOuverture(lignes: readonly Ligne[]): { libelle: string; lignes: LigneEcriture[] } | null {
  const apport = lignes.filter((l) => l.ecriture_id === "apport_initial");
  if (apport.length === 0) return null;
  return {
    libelle: apport[0]!.libelle,
    lignes: apport.map((l) =>
      l.sens === "debit" ? { compte: l.compte, debit: l.montant_centimes } : { compte: l.compte, credit: l.montant_centimes },
    ),
  };
}

export const INTITULES_ETAPES: Record<EtapeEntreprise, string> = {
  0: "L'idée",
  1: "Le lancement",
  2: "L'atelier",
};

const LIBELLES_ACTIONS: Record<ActionVerrouillable, string> = {
  action_marketing: "la publicité",
  demande_pret: "l'emprunt",
  louer_atelier: "la location d'un local",
  achat_local: "l'achat d'un local",
  production_atelier: "la production à l'atelier",
  embauche: "l'embauche",
  vente_revendeur: "la vente aux revendeurs",
};

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

/**
 * Conditions à remplir avant la boutique : celles de la dernière étape connue du
 * moteur (étape 2). Les conditions propres à la boutique arriveront avec AE-9.
 */
export function conditionsBoutique(
  e: { etape: EtapeEntreprise; piecesVendues: number; chiffreAffairesHt: number; tresorerie: number },
  seuils: SeuilsEtapes,
): ConditionJauge[] {
  const manquantes =
    e.etape >= 2
      ? []
      : conditionsManquantes(
          2,
          {
            etape: e.etape,
            cumuls: { piecesVendues: e.piecesVendues, chiffreAffairesHt: centimes(e.chiffreAffairesHt) },
            tresorerie: centimes(e.tresorerie),
          },
          seuils,
        );
  const rempli = (cle: ConditionManquante["cle"]) => !manquantes.some((m) => m.cle === cle);
  const tresoOk = rempli("tresorerie_positive");
  return [
    {
      cle: "pieces_vendues",
      libelle: "Pièces vendues au total",
      valeur: Math.min(e.piecesVendues, seuils.piecesEtape1),
      max: seuils.piecesEtape1,
      texte: `${e.piecesVendues} / ${seuils.piecesEtape1}`,
      remplie: rempli("pieces_vendues"),
    },
    {
      cle: "chiffre_affaires_ht_cumule",
      libelle: "Chiffre d'affaires hors taxes cumulé",
      valeur: Math.min(e.chiffreAffairesHt, seuils.chiffreAffairesHtEtape2),
      max: seuils.chiffreAffairesHtEtape2,
      texte: `${euros(e.chiffreAffairesHt)} / ${euros(seuils.chiffreAffairesHtEtape2)}`,
      remplie: rempli("chiffre_affaires_ht_cumule"),
    },
    {
      cle: "tresorerie_positive",
      libelle: "Trésorerie positive",
      valeur: tresoOk ? 1 : 0,
      max: 1,
      texte: euros(e.tresorerie),
      remplie: tresoOk,
    },
  ];
}
