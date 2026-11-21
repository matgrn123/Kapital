import type { SupabaseClient } from "@supabase/supabase-js";
import {
  centimes,
  evaluerMissions,
  type MetriquesMissions,
  type ProgressionMission,
} from "@kapital/engine";

type EcritureCompta = {
  mois_jeu: number;
  libelle: string;
  compte: string;
  sens: "debit" | "credit";
  montant_centimes: number;
};

type LigneProgressionDb = {
  mission_id: string;
  etat: string;
  actuel: number;
  cible: number;
  validee_le: string | null;
};

const COMPTE_TRESORERIE = "512";
const COMPTE_VENTES = "707";
const COMPTE_COUT_VENTES = "7135";
const PREFIXE_VENTE = "Vente directe ";

function piecesDepuisLibelle(libelle: string): number {
  if (!libelle.startsWith(PREFIXE_VENTE)) return 0;
  const reste = libelle.slice(PREFIXE_VENTE.length);
  const premierNombre = reste.match(/^(\d+)/);
  if (!premierNombre || !premierNombre[1]) return 0;
  return parseInt(premierNombre[1], 10);
}

export function calculerMetriques(
  ecritures: readonly EcritureCompta[],
  moisJeuCreation: number,
  moisJeuCourant: number,
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
    if (e.compte === COMPTE_COUT_VENTES && e.sens === "debit") {
      coutCumul += e.montant_centimes;
    }
    if (e.compte === COMPTE_COUT_VENTES && e.sens === "credit") {
      coutCumul -= e.montant_centimes;
    }
    if (e.compte === COMPTE_TRESORERIE) {
      const delta = e.sens === "debit" ? e.montant_centimes : -e.montant_centimes;
      soldeTresorerie.set(
        e.mois_jeu,
        (soldeTresorerie.get(e.mois_jeu) ?? 0) + delta,
      );
    }
  }

  const moisTries = [...soldeTresorerie.keys()].sort((a, b) => a - b);
  let cumulTres = 0;
  let aEuDecouvert = false;
  for (const m of moisTries) {
    cumulTres += soldeTresorerie.get(m) ?? 0;
    if (cumulTres < 0) aEuDecouvert = true;
  }

  const moisAvecVentes = [...caParMois.entries()]
    .filter(([, c]) => c > 0)
    .sort(([a], [b]) => a - b);
  const caMoisInitial = moisAvecVentes[0]?.[1] ?? 0;
  const caMoisMax = moisAvecVentes.reduce((max, [, c]) => Math.max(max, c), 0);

  return {
    pieces_vendues_total: pieces,
    marge_brute_cumul_centimes: centimes(caCumul - coutCumul),
    mois_jeu_courant: moisJeuCourant,
    mois_jeu_creation: moisJeuCreation,
    a_eu_decouvert: aEuDecouvert,
    ca_mois_initial_centimes: centimes(caMoisInitial),
    ca_mois_max_centimes: centimes(caMoisMax),
  };
}

export async function chargerProgressionMissions(
  supabase: SupabaseClient,
  companyId: string,
): Promise<readonly ProgressionMission[] | null> {
  const [compta, monde, lignesMiss] = await Promise.all([
    supabase
      .from("ledger_entries")
      .select("mois_jeu, libelle, compte, sens, montant_centimes")
      .eq("company_id", companyId),
    supabase.from("worlds").select("mois_courant").limit(1).maybeSingle(),
    supabase
      .from("mission_progress")
      .select("mission_id, etat, actuel, cible, validee_le")
      .eq("company_id", companyId),
  ]);

  const ecritures = (compta.data ?? []) as EcritureCompta[];
  const moisCourant = (monde.data?.mois_courant as number | undefined) ?? 0;
  const lignes = (lignesMiss.data ?? []) as LigneProgressionDb[];

  const metriques = calculerMetriques(ecritures, 0, moisCourant);
  const progressions = evaluerMissions(metriques);

  // Verrou "une fois validée, toujours validée"
  const dejaValidees = new Set(
    lignes.filter((l) => l.etat === "validee").map((l) => l.mission_id),
  );
  const resultat = progressions.map((p) => {
    if (dejaValidees.has(p.id)) {
      return { ...p, etat: "validee" as const };
    }
    return p;
  });

  // Persistance : met à jour mission_progress
  const maintenant = new Date().toISOString();
  const upserts = resultat.map((p) => ({
    company_id: companyId,
    mission_id: p.id,
    etat: p.etat,
    actuel: p.actuel,
    cible: p.cible,
    validee_le: p.etat === "validee"
      ? (lignes.find((l) => l.mission_id === p.id)?.validee_le ?? maintenant)
      : null,
    mise_a_jour_le: maintenant,
  }));
  await supabase
    .from("mission_progress")
    .upsert(upserts, { onConflict: "company_id,mission_id" });

  return resultat;
}
