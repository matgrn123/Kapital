import type { DecisionDemandePret } from "@kapital/engine";
import { ok, refuse, type ContexteValidation, type Result } from "../types.js";
import { verifierDeblocage } from "./verrouEtape.js";

const DUREE_MIN_MOIS = 12;
const DUREE_MAX_MOIS = 240;

export function validerDemandePret(
  ctx: ContexteValidation,
  d: DecisionDemandePret,
): Result {
  const verrou = verifierDeblocage(ctx, "demande_pret");
  if (!verrou.ok) return verrou;
  if (d.montant <= 0) {
    return refuse(
      "montant_invalide",
      `Le montant demandé doit être strictement positif (reçu ${d.montant} centimes).`,
    );
  }
  if (d.dureeMois < DUREE_MIN_MOIS || d.dureeMois > DUREE_MAX_MOIS) {
    return refuse(
      "duree_hors_bornes",
      `La durée du prêt doit être comprise entre ${DUREE_MIN_MOIS} et ${DUREE_MAX_MOIS} mois (reçu ${d.dureeMois}).`,
    );
  }
  const detteEnCours = ctx.entreprise.prets.reduce(
    (s, p) => s + p.capitalRestant,
    0,
  );
  const detteTotaleApres = detteEnCours + d.montant;
  // Garde-fou simple : la dette totale ne doit pas dépasser 5× la trésorerie
  const plafondDette = Math.max(ctx.entreprise.tresorerie, 1) * 5;
  if (detteTotaleApres > plafondDette) {
    return refuse(
      "endettement_excessif",
      `Dette totale après prêt (${(detteTotaleApres / 100).toFixed(2)} €) excède 5× votre trésorerie actuelle (${(ctx.entreprise.tresorerie / 100).toFixed(2)} €).`,
    );
  }
  return ok();
}
