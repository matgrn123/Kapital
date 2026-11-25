import { chargerParametresV1 } from "@kapital/content";
import {
  coefficientsSalairesDepuisParametres,
  evaluerEmbauche,
  postesEquipesAtelier,
  postesLibres,
  type DecisionEmbauche,
} from "@kapital/engine";
import { ok, refuse, type ContexteValidation, type Result } from "../types.js";
import { verifierDeblocage } from "./verrouEtape.js";

/** Message montré au joueur quand aucun poste n'est libre pour un artisan (3D-3). */
export const MESSAGE_AUCUN_POSTE_LIBRE =
  "Pose d'abord un poste de travail dans ton atelier (écran Atelier) : tous tes postes sont occupés.";

/**
 * 3D-3 (décision du 25 novembre 2026) : embaucher un ARTISAN sans poste libre est REFUSÉ. Les
 * postes sont les modules « poste » posés dans le plan de l'atelier (atelier/effetsPlan) ; un
 * encadrant n'occupe pas de poste et reste embauchable.
 * Autres refus : salaire sous le SMIC, ou trésorerie sous la réserve (paramètre
 * embauche_reserve_mois_cout_employeur × coût employeur calculé par le moteur).
 */
export function validerEmbauche(
  ctx: ContexteValidation,
  d: DecisionEmbauche,
): Result {
  const verrou = verifierDeblocage(ctx, "embauche");
  if (!verrou.ok) return verrou;
  if (
    d.poste === "artisan" &&
    postesLibres(ctx.entreprise.salaries, postesEquipesAtelier(ctx.entreprise.atelier)) === 0
  ) {
    return refuse("aucun_poste_libre", MESSAGE_AUCUN_POSTE_LIBRE);
  }
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
