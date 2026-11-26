import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chargerParametresV1, type Parametres } from "@kapital/content";
import { enregistrerEvenementsSupabase, evenementMissionValidee } from "@kapital/server";
import {
  DEFINITIONS_MISSIONS,
  evaluerMissions,
  metriquesDepuisGrandLivre,
  reglesMissionsDepuis,
  type LigneGrandLivreMission,
  type MetriquesMissions,
  type ProgressionMission,
} from "@kapital/engine";
import { formaterEuros } from "./formatage";

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

/** Une ligne de ledger_entries telle que lue en base (cree_le : instant réel de l'écriture). */
export type LigneLedgerDb = Omit<LigneGrandLivreMission, "instant_ms"> & { cree_le?: string | null };

/**
 * Heure du jeu (ms) d'un instant réel lu en base : instant réel moins l'origine de l'horloge
 * (worlds.debut_reel ; en production le 1er janvier 1970, les deux se confondent). null si la
 * date manque ou est illisible.
 */
export function heureDuJeuMs(iso: string | null | undefined, debutReelMs: number): number | null {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? ms - debutReelMs : null;
}

/**
 * Métriques des missions depuis les lignes lues en base (règle du moteur, partagée avec le banc).
 * Horloge réelle : chaque écriture est datée par son cree_le, la société par companies.cree_le,
 * chaque boutique par la signature de son bail (points_de_vente.cree_le). Fonction pure : l'instant
 * présent est fourni par l'appelant.
 */
export function metriquesDepuisLignesDb(a: {
  params: Parametres;
  lignes: readonly LigneLedgerDb[];
  debutReelIso: string | null;
  creeLeSociete: string | null;
  maintenantMs: number;
  boutiques?: readonly { cree_le: string | null }[];
  localEnregistre?: boolean;
}): MetriquesMissions {
  const debutReelMs = heureDuJeuMs(a.debutReelIso, 0) ?? 0;
  const maintenant = a.maintenantMs - debutReelMs;
  const ecritures: LigneGrandLivreMission[] = a.lignes.map(({ cree_le, ...l }) => {
    const instant = heureDuJeuMs(cree_le, debutReelMs);
    return instant === null ? l : { ...l, instant_ms: instant };
  });
  const boutiques = (a.boutiques ?? []).flatMap((b) => {
    const signee = heureDuJeuMs(b.cree_le, debutReelMs);
    return signee === null ? [] : [{ signee_le_ms: signee }];
  });
  return metriquesDepuisGrandLivre(ecritures, {
    // Sans date de création, la société est comptée comme née à l'instant (rien n'est encore tenu).
    creationMs: heureDuJeuMs(a.creeLeSociete, debutReelMs) ?? maintenant,
    maintenantMs: maintenant,
    regles: reglesMissionsDepuis(a.params),
    boutiques,
    localEnregistre: a.localEnregistre ?? false,
  });
}

/** Texte de la jauge d'une mission : « 3 / 7 jours », « 120,00 € / 240,00 € », « 12 / 50 ». */
export function texteAvancement(id: string, actuel: number, cible: number): string {
  if (id === "mission3") return `${formaterEuros(actuel)} € / ${formaterEuros(cible)} €`;
  if (id === "mission2" || id === "mission4") return `${actuel} / ${cible} jour${cible > 1 ? "s" : ""}`;
  return `${actuel} / ${cible}`;
}

export async function chargerProgressionMissions(
  supabase: SupabaseClient,
  companyId: string,
): Promise<readonly ProgressionMission[] | null> {
  const [compta, monde, lignesMiss, societe, boutiques, locaux] = await Promise.all([
    supabase
      .from("ledger_entries")
      .select("ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes, cree_le")
      .eq("company_id", companyId),
    supabase.from("worlds").select("mois_courant, debut_reel").limit(1).maybeSingle(),
    supabase
      .from("mission_progress")
      .select("mission_id, etat, actuel, cible, validee_le")
      .eq("company_id", companyId),
    supabase.from("companies").select("cree_le").eq("id", companyId).maybeSingle(),
    supabase.from("points_de_vente").select("cree_le").eq("company_id", companyId),
    supabase.from("workshops").select("id").eq("company_id", companyId).limit(1),
  ]);

  const moisCourant = (monde.data?.mois_courant as number | undefined) ?? 0;
  const lignes = (lignesMiss.data ?? []) as LigneProgressionDb[];

  const metriques = metriquesDepuisLignesDb({
    params: chargerParametresV1(),
    lignes: (compta.data ?? []) as LigneLedgerDb[],
    debutReelIso: (monde.data?.debut_reel as string | null | undefined) ?? null,
    creeLeSociete: (societe.data?.cree_le as string | null | undefined) ?? null,
    maintenantMs: Date.now(),
    boutiques: (boutiques.data ?? []) as { cree_le: string | null }[],
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
