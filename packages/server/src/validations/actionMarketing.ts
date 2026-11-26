import { chargerParametresV1 } from "@kapital/content";
import {
  coefficientsMarketingDepuisParametres,
  verifierActionMarketing,
  type CoefficientsMarketing,
  type DecisionActionMarketing,
} from "@kapital/engine";
import { ok, refuse, type ContexteValidation, type Result } from "../types.js";
import { verifierDeblocage } from "./verrouEtape.js";

let coefficientsParDefaut: CoefficientsMarketing | null = null;

export function validerActionMarketing(
  ctx: ContexteValidation,
  d: DecisionActionMarketing,
): Result {
  const verrou = verifierDeblocage(ctx, "action_marketing");
  if (!verrou.ok) return verrou;
  if (d.montant <= 0) {
    return refuse(
      "montant_invalide",
      `Le montant marketing doit être strictement positif (reçu ${d.montant} centimes).`,
    );
  }
  // Règles de l'action (montant minimum, étape de l'affichage dans le métro) : les mêmes que
  // l'aperçu du navigateur et la route, calculées par le moteur.
  coefficientsParDefaut ??= coefficientsMarketingDepuisParametres(chargerParametresV1());
  const regles = verifierActionMarketing({
    action: d.action,
    montant: d.montant,
    etape: ctx.entreprise.etape,
    coefficients: coefficientsParDefaut,
  });
  if (!regles.ok) return refuse(regles.code, regles.message);
  if (d.montant > ctx.entreprise.tresorerie) {
    const manque = d.montant - ctx.entreprise.tresorerie;
    return refuse(
      "tresorerie_insuffisante",
      `Trésorerie insuffisante pour cette action : il manque ${(manque / 100).toFixed(2)} €.`,
    );
  }
  return ok();
}
