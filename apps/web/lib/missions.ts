import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chargerParametresV1, type Parametres } from "@kapital/content";
import {
  centimes,
  configTempsDepuis,
  evaluerMissions,
  horlogeDepuis,
  type BoutiquePourMission,
  type MetriquesMissions,
  type ProgressionMission,
} from "@kapital/engine";

function clientAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

type EcritureCompta = {
  /** Identifiant de l'écriture (bail_signature_…, achat_local_…) ; absent dans les anciens tests. */
  ecriture_id?: string;
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
/** Écritures qui prouvent qu'un local a été loué (signer_bail, 0027) ou acheté (acheter_local, 0028). */
const PREFIXES_LOCAL_SIGNE = ["bail_signature_", "achat_local_"];

/** Ce que le grand livre ne dit pas seul : les boutiques signées et les locaux occupés (AE-11). */
export type ComplementsMissions = {
  readonly boutiques?: readonly BoutiquePourMission[];
  /** Au moins un local (atelier) enregistré pour la société, loué ou acheté. */
  readonly localEnregistre?: boolean;
};

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
  const tresorerieFinMois: { mois: number; solde_centimes: ReturnType<typeof centimes> }[] = [];
  for (const m of moisTries) {
    cumulTres += soldeTresorerie.get(m) ?? 0;
    if (cumulTres < 0) aEuDecouvert = true;
    tresorerieFinMois.push({ mois: m, solde_centimes: centimes(cumulTres) });
  }
  const localSigne =
    complements.localEnregistre === true ||
    ecritures.some((e) => PREFIXES_LOCAL_SIGNE.some((p) => e.ecriture_id?.startsWith(p)));

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
    boutiques: [...(complements.boutiques ?? [])],
    tresorerie_fin_mois: tresorerieFinMois,
    local_signe: localSigne,
  };
}

/**
 * Mois de jeu où la société a été créée, lu sur l'horloge commune (début du monde + date de
 * création). Sans l'une des deux dates, 0 : la société est comptée comme née au début du monde.
 */
export function moisDeCreation(params: Parametres, debutMondeIso: string | null, creeLeIso: string | null): number {
  const debut = debutMondeIso ? Date.parse(debutMondeIso) : Number.NaN;
  const cree = creeLeIso ? Date.parse(creeLeIso) : Number.NaN;
  if (!Number.isFinite(debut) || !Number.isFinite(cree) || cree < debut) return 0;
  return horlogeDepuis(configTempsDepuis(params), debut, cree).moisEnCours;
}

export async function chargerProgressionMissions(
  supabase: SupabaseClient,
  companyId: string,
): Promise<readonly ProgressionMission[] | null> {
  const [compta, monde, lignesMiss, societe, boutiques, locaux] = await Promise.all([
    supabase
      .from("ledger_entries")
      .select("ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes")
      .eq("company_id", companyId),
    supabase.from("worlds").select("mois_courant, debut_reel").limit(1).maybeSingle(),
    supabase
      .from("mission_progress")
      .select("mission_id, etat, actuel, cible, validee_le")
      .eq("company_id", companyId),
    supabase.from("companies").select("cree_le").eq("id", companyId).maybeSingle(),
    supabase.from("points_de_vente").select("mois_signature, mois_ouverture").eq("company_id", companyId),
    supabase.from("workshops").select("id").eq("company_id", companyId).limit(1),
  ]);

  const ecritures = (compta.data ?? []) as EcritureCompta[];
  const moisCourant = (monde.data?.mois_courant as number | undefined) ?? 0;
  const lignes = (lignesMiss.data ?? []) as LigneProgressionDb[];

  // Le mois de création compte pour « Tenir six mois » : une société créée au mois 10
  // n'a pas tenu six mois parce que le monde, lui, en a dix.
  const moisCreation = moisDeCreation(
    chargerParametresV1(),
    (monde.data?.debut_reel as string | null | undefined) ?? null,
    (societe.data?.cree_le as string | null | undefined) ?? null,
  );
  const metriques = calculerMetriques(ecritures, moisCreation, moisCourant, {
    boutiques: ((boutiques.data ?? []) as { mois_signature: number; mois_ouverture: number }[]).map((b) => ({
      mois_signature: Number(b.mois_signature),
      mois_ouverture: Number(b.mois_ouverture),
    })),
    localEnregistre: (locaux.data ?? []).length > 0,
  });
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

  // Persistance : met à jour mission_progress via le client admin (RLS fermées
  // côté joueur après A.4). Si la clé service_role n'est pas disponible côté
  // navigateur, on saute la persistance — l'affichage reste correct puisque
  // `resultat` est calculé à partir des écritures.
  const admin = clientAdmin();
  if (admin) {
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
    await admin
      .from("mission_progress")
      .upsert(upserts, { onConflict: "company_id,mission_id" });
  }

  return resultat;
}
