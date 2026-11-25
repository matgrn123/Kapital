import { chargerParametresV1 } from "@kapital/content";
import { evaluerLicenciement, parametresLicenciementDepuis } from "@kapital/engine";
import type { DecisionLicenciement } from "@kapital/engine";
import { ok, refuse, type ContexteValidation, type Result } from "../types.js";

/** Le salarié doit exister, et la trésorerie doit couvrir l'indemnité légale (AE-7). */
export function validerLicenciement(
  ctx: ContexteValidation,
  d: DecisionLicenciement,
): Result {
  const salarie = ctx.entreprise.salaries.find((s) => s.id === d.salarie);
  if (!salarie) {
    return refuse(
      "salarie_inconnu",
      `Le salarié ${d.salarie} ne fait pas partie de votre entreprise.`,
    );
  }
  const eval_ = evaluerLicenciement(
    salarie,
    ctx.entreprise.tresorerie,
    parametresLicenciementDepuis(chargerParametresV1()),
  );
  if (!eval_.ok) return refuse(eval_.code, eval_.message);
  return ok();
}
