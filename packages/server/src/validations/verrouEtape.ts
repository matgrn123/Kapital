import { chargerParametresV1 } from "@kapital/content";
import {
  centimes,
  seuilsEtapesDepuis,
  verrouPour,
  type ActionVerrouillable,
  type ConditionManquante,
  type CumulsEtape,
  type EtapeEntreprise,
  type SeuilsEtapes,
  type VerrouEtape,
} from "@kapital/engine";
import { ok, type ContexteValidation, type Result, type ResultErreur } from "../types.js";

/** Clé stable de tous les refus d'étape. */
export const CODE_ETAPE_VERROUILLEE = "etape_insuffisante";

const LIBELLES: Record<ActionVerrouillable, string> = {
  action_marketing: "La publicité",
  demande_pret: "L'emprunt",
  louer_atelier: "La location d'un local",
  achat_local: "L'achat d'un local",
  production_atelier: "La production à l'atelier",
  embauche: "L'embauche",
  vente_revendeur: "La vente aux revendeurs",
  ouverture_boutique: "L'ouverture d'une boutique",
};

function euros(centimesMontant: number): string {
  return `${(centimesMontant / 100).toFixed(2).replace(".", ",")} €`;
}

/** La notoriété est un nombre à virgule (jauge de 0 à 100) : affichée au dixième. */
function arrondiPoints(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace(".", ",");
}

function phraseCondition(c: ConditionManquante): string {
  switch (c.cle) {
    case "pieces_vendues":
      return `il vous manque ${c.manque} pièces vendues (${c.actuel} sur ${c.requis})`;
    case "chiffre_affaires_ht_cumule":
      return `il vous manque ${euros(c.manque)} de chiffre d'affaires hors taxes cumulé (${euros(c.actuel)} sur ${euros(c.requis)})`;
    case "tresorerie_positive":
      return `votre trésorerie doit être positive à la clôture du mois (${euros(c.actuel)} aujourd'hui)`;
    case "tresorerie_minimale":
      return `il vous manque ${euros(c.manque)} de trésorerie à la clôture du mois (${euros(c.actuel)} sur ${euros(c.requis)})`;
    case "notoriete":
      return `il vous manque ${arrondiPoints(c.manque)} points de notoriété (${arrondiPoints(c.actuel)} sur ${c.requis})`;
  }
}

/** Refus structuré : clé stable, message, étape requise et conditions manquantes chiffrées. */
export function refusDepuisVerrou(v: VerrouEtape): ResultErreur {
  const manque = v.conditions.map(phraseCondition).join(" ; ");
  return {
    ok: false,
    code: CODE_ETAPE_VERROUILLEE,
    message:
      `${LIBELLES[v.action]} se débloque à l'étape ${v.etapeRequise} (vous êtes à l'étape ${v.etapeActuelle})` +
      (manque ? ` : ${manque}.` : "."),
    etapeRequise: v.etapeRequise,
    conditions: v.conditions,
  };
}

let seuilsParDefaut: SeuilsEtapes | null = null;
function seuilsDe(ctx: { seuilsEtapes?: SeuilsEtapes }): SeuilsEtapes {
  if (ctx.seuilsEtapes) return ctx.seuilsEtapes;
  seuilsParDefaut ??= seuilsEtapesDepuis(chargerParametresV1());
  return seuilsParDefaut;
}

/** Vérifie l'étape d'une entreprise (utilisé aussi par les routes d'API, qui n'ont que des colonnes). */
export function verifierDeblocageEtape(
  action: ActionVerrouillable,
  etat: {
    readonly etape: EtapeEntreprise;
    readonly cumuls?: CumulsEtape;
    readonly tresorerie: number;
    readonly notoriete?: number;
  },
  seuilsEtapes?: SeuilsEtapes,
): Result {
  const verrou = verrouPour(
    action,
    {
      etape: etat.etape,
      cumuls: etat.cumuls ?? { piecesVendues: 0, chiffreAffairesHt: centimes(0) },
      tresorerie: centimes(etat.tresorerie),
      notoriete: etat.notoriete ?? 0,
    },
    seuilsDe({ seuilsEtapes }),
  );
  return verrou === null ? ok() : refusDepuisVerrou(verrou);
}

export function verifierDeblocage(ctx: ContexteValidation, action: ActionVerrouillable): Result {
  return verifierDeblocageEtape(
    action,
    {
      etape: ctx.entreprise.etape,
      cumuls: ctx.entreprise.cumulsEtape,
      tresorerie: ctx.entreprise.tresorerie,
      notoriete: ctx.entreprise.marque.notoriete,
    },
    ctx.seuilsEtapes,
  );
}
