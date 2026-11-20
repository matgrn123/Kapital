import type { DecisionLicenciement } from "@kapital/engine";
import { ok, refuse, type ContexteValidation, type Result } from "../types.js";

export function validerLicenciement(
  ctx: ContexteValidation,
  d: DecisionLicenciement,
): Result {
  const existe = ctx.entreprise.salaries.some((s) => s.id === d.salarie);
  if (!existe) {
    return refuse(
      "salarie_inconnu",
      `Le salarié ${d.salarie} ne fait pas partie de votre entreprise.`,
    );
  }
  return ok();
}
