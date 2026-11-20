import type { Decision } from "@kapital/engine";
import { refuse, type ContexteValidation, type Result } from "./types.js";
import { validerActionMarketing } from "./validations/actionMarketing.js";
import { validerChangerPrix } from "./validations/changerPrix.js";
import { validerCommanderMatiere } from "./validations/commanderMatiere.js";
import { validerDemandePret } from "./validations/demandePret.js";
import { validerEmbauche } from "./validations/embauche.js";
import { validerLicenciement } from "./validations/licenciement.js";
import { validerOrdreProduction } from "./validations/ordreProduction.js";

export function validerDecision(
  ctx: ContexteValidation,
  d: Decision,
): Result {
  if (ctx.entreprise.statut === "liquidee") {
    return refuse(
      "entreprise_liquidee",
      `Votre entreprise est liquidée et ne peut plus prendre de décision.`,
    );
  }
  switch (d.type) {
    case "changer_prix":
      return validerChangerPrix(ctx, d);
    case "commander_matiere":
      return validerCommanderMatiere(ctx, d);
    case "ordre_production":
      return validerOrdreProduction(ctx, d);
    case "action_marketing":
      return validerActionMarketing(ctx, d);
    case "embauche":
      return validerEmbauche(ctx, d);
    case "licenciement":
      return validerLicenciement(ctx, d);
    case "demande_pret":
      return validerDemandePret(ctx, d);
  }
}

export function validerDecisions(
  ctx: ContexteValidation,
  decisions: readonly Decision[],
): readonly Result[] {
  return decisions.map((d) => validerDecision(ctx, d));
}
