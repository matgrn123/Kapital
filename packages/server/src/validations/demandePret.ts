import { chargerParametresV1 } from "@kapital/content";
import {
  centimes,
  evaluerDemandePret,
  finDuMoisMs,
  reglesPretDepuis,
  type DecisionDemandePret,
  type EcheancePret,
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

/** Une ligne de loan_schedules telle que la fonction SQL creer_pret l'attend (p_echeancier). */
export type LigneEcheanceEnBase = {
  readonly numero: number;
  readonly mensualite_centimes: number;
  readonly interets_centimes: number;
  readonly amortissement_centimes: number;
  readonly capital_restant_apres_centimes: number;
  /** Instant réel (ISO) de l'échéance : fin de son mois, minuit à Paris. */
  readonly instant_prevu: string;
};

/**
 * Lot T4 (horloge réelle) : l'échéance n° k d'un prêt signé au mois `moisDebut` est payée par la
 * clôture du mois `moisDebut + k` (moteur/cloture.ts), et la base la range à ce mois
 * (loan_schedules.mois_jeu = p_mois_jeu + numéro). Son instant prévu est donc la fin de ce mois
 * (`finDuMoisMs`), en instant réel : heure du jeu + worlds.debut_reel (`debutReelMs`).
 */
export function lignesEcheancierEnBase(
  echeancier: readonly EcheancePret[],
  moisDebut: number,
  debutReelMs: number,
): LigneEcheanceEnBase[] {
  return echeancier.map((ech) => ({
    numero: ech.numero,
    mensualite_centimes: ech.montant,
    interets_centimes: ech.interets,
    amortissement_centimes: ech.amortissement,
    capital_restant_apres_centimes: ech.capitalRestantApres,
    instant_prevu: new Date(debutReelMs + finDuMoisMs(moisDebut + ech.numero)).toISOString(),
  }));
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
