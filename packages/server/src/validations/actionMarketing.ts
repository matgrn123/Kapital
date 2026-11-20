import type { DecisionActionMarketing } from "@kapital/engine";
import { ok, refuse, type ContexteValidation, type Result } from "../types.js";

export function validerActionMarketing(
  ctx: ContexteValidation,
  d: DecisionActionMarketing,
): Result {
  if (d.montant <= 0) {
    return refuse(
      "montant_invalide",
      `Le montant marketing doit être strictement positif (reçu ${d.montant} centimes).`,
    );
  }
  if (d.montant > ctx.entreprise.tresorerie) {
    const manque = d.montant - ctx.entreprise.tresorerie;
    return refuse(
      "tresorerie_insuffisante",
      `Trésorerie insuffisante pour cette action : il manque ${(manque / 100).toFixed(2)} €.`,
    );
  }
  return ok();
}
