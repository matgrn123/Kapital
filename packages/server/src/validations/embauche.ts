import { chargerParametresV1 } from "@kapital/content";
import {
  coefficientsSalairesDepuisParametres,
  evaluerEmbauche,
  type DecisionEmbauche,
} from "@kapital/engine";
import { ok, refuse, type ContexteValidation, type Result } from "../types.js";
import { verifierDeblocage } from "./verrouEtape.js";

/**
 * AE-7 : l'embauche sans poste libre est ACCEPTÉE (le joueur peut anticiper), mais le salarié
 * ne produit pas tant qu'aucune machine n'est libre : le moteur ne compte que les artisans qui
 * occupent un poste (artisansAuPoste). Le salaire est dû dans tous les cas.
 * Refus : salaire sous le SMIC, ou trésorerie sous la réserve (paramètre
 * embauche_reserve_mois_cout_employeur × coût employeur calculé par le moteur).
 */
export function validerEmbauche(
  ctx: ContexteValidation,
  d: DecisionEmbauche,
): Result {
  const verrou = verifierDeblocage(ctx, "embauche");
  if (!verrou.ok) return verrou;
  const params = chargerParametresV1();
  const moisReserve = params["embauche_reserve_mois_cout_employeur"]?.valeur;
  if (moisReserve === undefined || !(moisReserve >= 0)) {
    return refuse("parametre_manquant", "Paramètre embauche_reserve_mois_cout_employeur manquant.");
  }
  const r = evaluerEmbauche(
    d.salaireBrutMensuel,
    ctx.entreprise.tresorerie,
    coefficientsSalairesDepuisParametres(params),
    moisReserve,
  );
  return r.ok ? ok() : refuse(r.code, r.message);
}
