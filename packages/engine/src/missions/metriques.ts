import { centimes } from "../types/primitifs.js";
import type { BoutiquePourMission, MetriquesMissions, SoldeTresorerieMois } from "./types.js";

// Métriques des missions, lues dans le grand livre : la même fonction sert au site
// (apps/web/lib/missions.ts, lignes de ledger_entries) et au banc d'essai (tools/sim).

/** Une ligne du grand livre, à plat (une ligne = un compte, un sens, un montant). */
export type LigneGrandLivreMission = {
  /** Identifiant de l'écriture (bail_signature_…, achat_local_…) ; absent dans d'anciens tests. */
  readonly ecriture_id?: string;
  readonly mois_jeu: number;
  readonly libelle: string;
  readonly compte: string;
  readonly sens: "debit" | "credit";
  readonly montant_centimes: number;
};

/** Ce que le grand livre ne dit pas seul : les boutiques signées et les locaux occupés (AE-11). */
export type ComplementsMissions = {
  readonly boutiques?: readonly BoutiquePourMission[];
  /** Au moins un local (atelier) enregistré pour la société, loué ou acheté. */
  readonly localEnregistre?: boolean;
};

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

export function metriquesDepuisGrandLivre(
  ecritures: readonly LigneGrandLivreMission[],
  moisJeuCreation: number,
  moisJeuCourant: number,
  complements: ComplementsMissions = {},
): MetriquesMissions {
  let pieces = 0;
  let caCumul = 0;
  let coutCumul = 0;
  const caParMois = new Map<number, number>();
  const soldeTresorerie = new Map<number, number>();

  for (const e of ecritures) {
    if (e.compte === COMPTE_VENTES && e.sens === "credit") {
      caCumul += e.montant_centimes;
      caParMois.set(e.mois_jeu, (caParMois.get(e.mois_jeu) ?? 0) + e.montant_centimes);
      pieces += piecesDepuisLibelle(e.libelle);
    }
    if (e.compte === COMPTE_VENTES && e.sens === "debit") {
      caCumul -= e.montant_centimes;
      caParMois.set(e.mois_jeu, (caParMois.get(e.mois_jeu) ?? 0) - e.montant_centimes);
    }
    if (e.compte === COMPTE_COUT_VENTES && e.sens === "debit") coutCumul += e.montant_centimes;
    if (e.compte === COMPTE_COUT_VENTES && e.sens === "credit") coutCumul -= e.montant_centimes;
    if (e.compte === COMPTE_TRESORERIE) {
      const delta = e.sens === "debit" ? e.montant_centimes : -e.montant_centimes;
      soldeTresorerie.set(e.mois_jeu, (soldeTresorerie.get(e.mois_jeu) ?? 0) + delta);
    }
  }

  const moisTries = [...soldeTresorerie.keys()].sort((a, b) => a - b);
  let cumulTres = 0;
  let aEuDecouvert = false;
  const tresorerieFinMois: SoldeTresorerieMois[] = [];
  for (const m of moisTries) {
    cumulTres += soldeTresorerie.get(m) ?? 0;
    if (cumulTres < 0) aEuDecouvert = true;
    tresorerieFinMois.push({ mois: m, solde_centimes: centimes(cumulTres) });
  }

  const moisAvecVentes = [...caParMois.entries()].filter(([, c]) => c > 0).sort(([a], [b]) => a - b);
  const caMoisInitial = moisAvecVentes[0]?.[1] ?? 0;
  const caMoisMax = moisAvecVentes.reduce((max, [, c]) => Math.max(max, c), 0);
  const localSigne =
    complements.localEnregistre === true ||
    ecritures.some((e) => PREFIXES_LOCAL_SIGNE.some((p) => e.ecriture_id?.startsWith(p)));

  return {
    pieces_vendues_total: pieces,
    marge_brute_cumul_centimes: centimes(caCumul - coutCumul),
    mois_jeu_courant: moisJeuCourant,
    mois_jeu_creation: moisJeuCreation,
    a_eu_decouvert: aEuDecouvert,
    ca_mois_initial_centimes: centimes(caMoisInitial),
    ca_mois_max_centimes: centimes(caMoisMax),
    boutiques: [...(complements.boutiques ?? [])],
    tresorerie_fin_mois: tresorerieFinMois,
    local_signe: localSigne,
  };
}
