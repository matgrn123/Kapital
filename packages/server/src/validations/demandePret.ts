import { chargerParametresV1 } from "@kapital/content";
import {
  centimes,
  evaluerDemandePret,
  reglesPretDepuis,
  type DecisionDemandePret,
  type ReglesPret,
} from "@kapital/engine";
import { ok, type ContexteValidation, type Result } from "../types.js";
import { verifierDeblocage } from "./verrouEtape.js";

let reglesParDefaut: ReglesPret | undefined;

/** Plafonds, durées et marges des prêts, lus dans les paramètres sourcés. */
export function reglesPretV1(): ReglesPret {
  reglesParDefaut ??= reglesPretDepuis(chargerParametresV1());
  return reglesParDefaut;
}

export function validerDemandePret(
  ctx: ContexteValidation,
  d: DecisionDemandePret,
): Result {
  const verrou = verifierDeblocage(ctx, "demande_pret");
  if (!verrou.ok) return verrou;
  const detteEnCours = ctx.entreprise.prets.reduce((s, p) => s + p.capitalRestant, 0);
  const evaluation = evaluerDemandePret(
    { tresorerie: ctx.entreprise.tresorerie, detteEnCours: centimes(detteEnCours) },
    d,
    ctx.reglesPret ?? reglesPretV1(),
  );
  if (evaluation.ok) return ok();
  return {
    ok: false,
    code: evaluation.code,
    message: evaluation.message,
    ...(evaluation.depassement ? { depassement: evaluation.depassement } : {}),
  };
}
