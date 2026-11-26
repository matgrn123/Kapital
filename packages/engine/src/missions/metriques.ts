import type { Parametres } from "@kapital/content";
import { parametreObligatoire } from "../moteur/fabrication.js";
import { finDuMoisMs } from "../moteur/temps.js";
import { centimes } from "../types/primitifs.js";
import type { BoutiquePourMission, MetriquesMissions, ReglesMissions, SoldeTresorerie } from "./types.js";

// Métriques des missions, lues dans le grand livre : la même fonction sert au site
// (apps/web/lib/missions.ts, lignes de ledger_entries) et au banc d'essai (tools/sim).
// Horloge réelle : les missions se comptent en jours ; chaque ligne est datée à la minute
// (ledger_entries.cree_le, ramené à l'heure du jeu par le site).

/** Une ligne du grand livre, à plat (une ligne = un compte, un sens, un montant). */
export type LigneGrandLivreMission = {
  /** Identifiant de l'écriture (bail_signature_…, achat_local_…) ; absent dans d'anciens tests. */
  readonly ecriture_id?: string;
  readonly mois_jeu: number;
  /**
   * Instant de l'écriture (heure du jeu, ms). Absent (banc d'essai, qui avance par mois entiers) :
   * l'écriture est datée du dernier instant de son mois.
   */
  readonly instant_ms?: number;
  readonly libelle: string;
  readonly compte: string;
  readonly sens: "debit" | "credit";
  readonly montant_centimes: number;
};

/** Ce que le grand livre ne dit pas seul : le temps, les règles, les boutiques et les locaux. */
export type ContexteMissions = {
  /** Création de la société (heure du jeu, ms). */
  readonly creationMs: number;
  /** Instant de l'évaluation (heure du jeu, ms). */
  readonly maintenantMs: number;
  readonly regles: ReglesMissions;
  readonly boutiques?: readonly BoutiquePourMission[];
  /** Au moins un local (atelier) enregistré pour la société, loué ou acheté. */
  readonly localEnregistre?: boolean;
};

/** Durées des missions, lues dans les paramètres (aucune constante en dur). */
export function reglesMissionsDepuis(params: Parametres): ReglesMissions {
  return {
    joursTenir: parametreObligatoire(params, "mission_tenir_jours"),
    joursPeriodeCroissance: parametreObligatoire(params, "mission_croissance_periode_jours"),
    joursBoutique: parametreObligatoire(params, "mission_boutique_jours"),
  };
}

const MS_PAR_JOUR = 86_400_000;
const COMPTE_TRESORERIE = "512";
const COMPTE_VENTES = "707";
const COMPTE_COUT_VENTES = "7135";
const PREFIXE_VENTE = "Vente directe ";
/** Écritures qui prouvent qu'un local a été loué (signer_bail, 0027) ou acheté (acheter_local, 0028). */
const PREFIXES_LOCAL_SIGNE = ["bail_signature_", "achat_local_"];

function piecesDepuisLibelle(libelle: string): number {
  if (!libelle.startsWith(PREFIXE_VENTE)) return 0;
  const premierNombre = libelle.slice(PREFIXE_VENTE.length).match(/^(\d+)/);
  if (!premierNombre || !premierNombre[1]) return 0;
  return parseInt(premierNombre[1], 10);
}

function instantDe(e: LigneGrandLivreMission): number {
  return e.instant_ms ?? finDuMoisMs(e.mois_jeu) - 1;
}

export function metriquesDepuisGrandLivre(
  ecritures: readonly LigneGrandLivreMission[],
  contexte: ContexteMissions,
): MetriquesMissions {
  const { creationMs, maintenantMs, regles } = contexte;
  const msParPeriode = regles.joursPeriodeCroissance * MS_PAR_JOUR;
  let pieces = 0;
  let caCumul = 0;
  let coutCumul = 0;
  const caParPeriode = new Map<number, number>();
  const mouvementsTresorerie = new Map<number, number>();

  for (const e of ecritures) {
    const instant = instantDe(e);
    if (e.compte === COMPTE_VENTES) {
      const signe = e.sens === "credit" ? 1 : -1;
      caCumul += signe * e.montant_centimes;
      // Périodes comptées depuis la création (une écriture antérieure tombe dans la première).
      const periode = Math.max(0, Math.floor((instant - creationMs) / msParPeriode));
      caParPeriode.set(periode, (caParPeriode.get(periode) ?? 0) + signe * e.montant_centimes);
      if (e.sens === "credit") pieces += piecesDepuisLibelle(e.libelle);
    }
    if (e.compte === COMPTE_COUT_VENTES && e.sens === "debit") coutCumul += e.montant_centimes;
    if (e.compte === COMPTE_COUT_VENTES && e.sens === "credit") coutCumul -= e.montant_centimes;
    if (e.compte === COMPTE_TRESORERIE) {
      const delta = e.sens === "debit" ? e.montant_centimes : -e.montant_centimes;
      mouvementsTresorerie.set(instant, (mouvementsTresorerie.get(instant) ?? 0) + delta);
    }
  }

  // Solde après chaque instant où la banque bouge : un découvert passager compte, même s'il
  // est comblé avant la fin du mois.
  let cumul = 0;
  let aEuDecouvert = false;
  const tresorerie: SoldeTresorerie[] = [];
  for (const instant of [...mouvementsTresorerie.keys()].sort((a, b) => a - b)) {
    cumul += mouvementsTresorerie.get(instant) ?? 0;
    if (cumul < 0) aEuDecouvert = true;
    tresorerie.push({ instant_ms: instant, solde_centimes: centimes(cumul) });
  }

  const periodesAvecVentes = [...caParPeriode.entries()].filter(([, c]) => c > 0).sort(([a], [b]) => a - b);
  const caInitial = periodesAvecVentes[0]?.[1] ?? 0;
  const caMax = periodesAvecVentes.reduce((max, [, c]) => Math.max(max, c), 0);
  const localSigne =
    contexte.localEnregistre === true ||
    ecritures.some((e) => PREFIXES_LOCAL_SIGNE.some((p) => e.ecriture_id?.startsWith(p)));

  return {
    pieces_vendues_total: pieces,
    marge_brute_cumul_centimes: centimes(caCumul - coutCumul),
    creation_ms: creationMs,
    maintenant_ms: maintenantMs,
    a_eu_decouvert: aEuDecouvert,
    ca_periode_initiale_centimes: centimes(caInitial),
    ca_periode_max_centimes: centimes(caMax),
    boutiques: [...(contexte.boutiques ?? [])],
    tresorerie,
    local_signe: localSigne,
    regles,
  };
}
