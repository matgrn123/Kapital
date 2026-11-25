import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { chargerParametresV1 } from "@kapital/content";
import { verifierDeblocageEtape } from "@kapital/server";
import {
  centimes,
  etapeEffective,
  idEntreprise,
  idSalarie,
  type ActionVerrouillable,
  type Entreprise,
  type EtapeEntreprise,
  type Poste,
  type Salarie,
} from "@kapital/engine";
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
  /** Compteurs de progression d'étape (migration 0025). */
  readonly companyPiecesVendues: number;
  readonly companyChiffreAffairesHt: number;
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
    .select("id, gamme, etape, tresorerie_centimes, pieces_vendues_total, chiffre_affaires_cumule_ht_centimes")
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
    // Réglage de développement : peut compter la société comme étant à l'étape 2 (voir etapeEffective).
    companyEtape: etapeEffective(entreprise.etape as EtapeEntreprise, chargerParametresV1()),
    companyPiecesVendues: Number(entreprise.pieces_vendues_total ?? 0),
    companyChiffreAffairesHt: Number(entreprise.chiffre_affaires_cumule_ht_centimes ?? 0),
    companyTresorerie: entreprise.tresorerie_centimes as number,
    supabaseAdmin,
    moisCourant,
  };
}

/**
 * AE-2 : refuse (403) une action verrouillée par l'étape, avec la condition manquante chiffrée.
 * Rend null si l'action est permise.
 */
export function refuserSiVerrouille(
  ctx: ContexteAction,
  action: ActionVerrouillable,
): NextResponse | null {
  const r = verifierDeblocageEtape(action, {
    etape: ctx.companyEtape as EtapeEntreprise,
    cumuls: {
      piecesVendues: ctx.companyPiecesVendues,
      chiffreAffairesHt: centimes(ctx.companyChiffreAffairesHt),
    },
    tresorerie: ctx.companyTresorerie,
  });
  if (r.ok) return null;
  return NextResponse.json(
    { error: r.message, code: r.code, etapeRequise: r.etapeRequise, conditions: r.conditions },
    { status: 403 },
  );
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

type LigneSalarie = {
  id: string;
  poste: Poste;
  salaire_brut_mensuel_centimes: number;
  anciennete_mois_debut: number;
  experience_mois_debut: number;
  mois_jeu_debut: number | null;
};

/**
 * AE-7 : l'entreprise telle que la voit `validerDecision` pour l'embauche et le licenciement
 * (trésorerie, salariés actifs avec ancienneté et expérience, nombre de machines). Les stocks,
 * prêts et catalogue ne servent pas à ces deux validations.
 */
export async function chargerEntreprisePersonnel(ctx: ContexteAction): Promise<Entreprise> {
  const [{ data: lignes }, { data: atelier }] = await Promise.all([
    ctx.supabaseAdmin
      .from("employees")
      .select("id, poste, salaire_brut_mensuel_centimes, anciennete_mois_debut, experience_mois_debut, mois_jeu_debut")
      .eq("company_id", ctx.companyId)
      .eq("statut", "actif"),
    ctx.supabaseAdmin
      .from("workshops")
      .select("surface_m2, loyer_mensuel_centimes, nombre_machines")
      .eq("company_id", ctx.companyId)
      .maybeSingle(),
  ]);
  const salaries: Salarie[] = ((lignes ?? []) as LigneSalarie[]).map((e) => {
    const dureeService = Math.max(0, ctx.moisCourant - (e.mois_jeu_debut ?? 0));
    return {
      id: idSalarie(e.id),
      poste: e.poste,
      salaireBrutMensuel: centimes(Number(e.salaire_brut_mensuel_centimes)),
      ancienneteMois: e.anciennete_mois_debut + dureeService,
      experienceMois: e.experience_mois_debut + dureeService,
    };
  });
  const a = atelier as { surface_m2: number; loyer_mensuel_centimes: number; nombre_machines: number } | null;
  return {
    id: idEntreprise(ctx.companyId),
    nom: "",
    gamme: ctx.companyGamme,
    etape: ctx.companyEtape as EtapeEntreprise,
    cumulsEtape: {
      piecesVendues: ctx.companyPiecesVendues,
      chiffreAffairesHt: centimes(ctx.companyChiffreAffairesHt),
    },
    proprietaire: { type: "joueur", idProfil: ctx.userId },
    statut: "active",
    tresorerie: centimes(ctx.companyTresorerie),
    stocksMatiere: [],
    stocksFinis: [],
    salaries,
    atelier: a
      ? {
          surfaceM2: a.surface_m2,
          loyerMensuel: centimes(Number(a.loyer_mensuel_centimes)),
          nombreMachines: a.nombre_machines,
        }
      : null,
    marque: { notoriete: 0, desirabilite: 0 },
    prets: [],
    catalogue: [],
  };
}
