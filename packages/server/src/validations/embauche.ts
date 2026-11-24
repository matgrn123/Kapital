import type { DecisionEmbauche } from "@kapital/engine";
import { ok, refuse, type ContexteValidation, type Result } from "../types.js";
import { verifierDeblocage } from "./verrouEtape.js";

export function validerEmbauche(
  ctx: ContexteValidation,
  d: DecisionEmbauche,
): Result {
  const verrou = verifierDeblocage(ctx, "embauche");
  if (!verrou.ok) return verrou;
  if (d.salaireBrutMensuel <= 0) {
    return refuse(
      "salaire_invalide",
      `Le salaire brut mensuel doit être strictement positif (reçu ${d.salaireBrutMensuel} centimes).`,
    );
  }
  // Garde-fou : la trésorerie doit couvrir au moins deux mois de salaire chargé approximatif (×1,42)
  const coutApproximatif = Math.round(d.salaireBrutMensuel * 1.42);
  const reserveMinimale = coutApproximatif * 2;
  if (ctx.entreprise.tresorerie < reserveMinimale) {
    const manque = reserveMinimale - ctx.entreprise.tresorerie;
    return refuse(
      "tresorerie_insuffisante",
      `Il faut au moins deux mois de paie en réserve avant d'embaucher. Il manque ${(manque / 100).toFixed(2)} €.`,
    );
  }
  return ok();
}
