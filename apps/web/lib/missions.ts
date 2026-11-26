import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chargerParametresV1, type Parametres } from "@kapital/content";
import { enregistrerEvenementsSupabase, evenementMissionValidee } from "@kapital/server";
import {
  DEFINITIONS_MISSIONS,
  configTempsDepuis,
  evaluerMissions,
  horlogeDepuis,
  metriquesDepuisGrandLivre,
  type ComplementsMissions,
  type LigneGrandLivreMission,
  type MetriquesMissions,
  type ProgressionMission,
} from "@kapital/engine";

export type { ComplementsMissions };

function clientAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

type LigneProgressionDb = {
  mission_id: string;
  etat: string;
  actuel: number;
  cible: number;
  validee_le: string | null;
};

/** Métriques des missions depuis les lignes de ledger_entries (règle du moteur, partagée avec le banc). */
export function calculerMetriques(
  ecritures: readonly LigneGrandLivreMission[],
  moisJeuCreation: number,
  moisJeuCourant: number,
  complements: ComplementsMissions = {},
): MetriquesMissions {
  return metriquesDepuisGrandLivre(ecritures, moisJeuCreation, moisJeuCourant, complements);
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

  const ecritures = (compta.data ?? []) as LigneGrandLivreMission[];
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

    // Journal : une mission qui vient d'être validée (une seule fois par mission, clé unique).
    const nouvelles = resultat.filter((p) => p.etat === "validee" && !dejaValidees.has(p.id));
    if (nouvelles.length > 0) {
      try {
        await enregistrerEvenementsSupabase(
          admin,
          companyId,
          nouvelles.map((p) =>
            evenementMissionValidee({
              missionId: p.id,
              titreMission: DEFINITIONS_MISSIONS.find((d) => d.id === p.id)?.titre ?? p.id,
              moisJeu: moisCourant,
              instantMs: Date.parse(maintenant),
            }),
          ),
        );
      } catch {
        // Journal indisponible : la mission reste validée, seul le récit manque.
      }
    }
  }

  return resultat;
}
