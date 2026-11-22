import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { creerClientServeur } from "./supabase/server";

// Helpers partagés par toutes les routes /api/actions/*.
// - authentification de l'utilisateur via le cookie Supabase
// - chargement de son entreprise
// - client admin service_role pour effectuer les écritures (bypass RLS)

export type ContexteAction = {
  readonly userId: string;
  readonly companyId: string;
  readonly companyGamme: "entree" | "milieu" | "haut";
  readonly companyEtape: number;
  readonly companyTresorerie: number;
  readonly supabaseAdmin: SupabaseClient;
  readonly moisCourant: number;
};

export type ErreurAction = NextResponse<{ error: string }>;

function reponseErreur(status: number, message: string): ErreurAction {
  return NextResponse.json({ error: message }, { status });
}

export async function chargerContexte(): Promise<ContexteAction | ErreurAction> {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return reponseErreur(401, "Non authentifié.");

  const { data: companies } = await supabase
    .from("companies")
    .select("id, gamme, etape, tresorerie_centimes")
    .eq("owner_profile_id", user.id)
    .limit(1);
  const entreprise = companies?.[0];
  if (!entreprise) return reponseErreur(400, "Aucune entreprise.");

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return reponseErreur(500, "Variables Supabase manquantes.");
  }
  const supabaseAdmin = createClient(url, serviceKey);

  const { data: monde } = await supabaseAdmin
    .from("worlds")
    .select("mois_courant")
    .eq("etat", "actif")
    .limit(1)
    .maybeSingle();
  const moisCourant = (monde?.mois_courant as number | undefined) ?? 0;

  return {
    userId: user.id,
    companyId: entreprise.id as string,
    companyGamme: entreprise.gamme as "entree" | "milieu" | "haut",
    companyEtape: entreprise.etape as number,
    companyTresorerie: entreprise.tresorerie_centimes as number,
    supabaseAdmin,
    moisCourant,
  };
}

export function estErreurAction(x: unknown): x is ErreurAction {
  return x instanceof NextResponse;
}

export type LigneEcriture = {
  readonly compte: string;
  readonly sens: "debit" | "credit";
  readonly montant_centimes: number;
};

/**
 * Écrit un lot de lignes de grand livre pour une même écriture, en vérifiant
 * que la somme des débits égale celle des crédits. Le trigger A.2 doublonera
 * cette vérification côté base.
 */
export async function ecrireEcritures(
  admin: SupabaseClient,
  params: {
    companyId: string;
    ecritureId: string;
    moisJeu: number;
    libelle: string;
    lignes: readonly LigneEcriture[];
  },
): Promise<void> {
  const totalDebit = params.lignes
    .filter((l) => l.sens === "debit")
    .reduce((s, l) => s + l.montant_centimes, 0);
  const totalCredit = params.lignes
    .filter((l) => l.sens === "credit")
    .reduce((s, l) => s + l.montant_centimes, 0);
  if (totalDebit !== totalCredit) {
    throw new Error(
      `Écriture ${params.ecritureId} déséquilibrée : débit ${totalDebit}, crédit ${totalCredit}.`,
    );
  }
  const rows = params.lignes.map((l) => ({
    company_id: params.companyId,
    ecriture_id: params.ecritureId,
    mois_jeu: params.moisJeu,
    libelle: params.libelle,
    compte: l.compte,
    sens: l.sens,
    montant_centimes: l.montant_centimes,
  }));
  const { error } = await admin.from("ledger_entries").insert(rows);
  if (error) throw new Error(`insert ledger : ${error.message}`);
}
