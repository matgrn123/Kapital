import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { chargerModulesV1, chargerParametresV1 } from "@kapital/content";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";
import { fonctionAbsente } from "../../../../lib/rpc";
import { versQuand } from "../../../../lib/cadre";
import {
  deciderAmenagement,
  delaiMiseEnPlaceAmenagementMs,
  postesFournisDepuisParametres,
  valeurNetteMaterielEnService,
  type GrilleAtelier,
  type ModuleStocke,
} from "../../../../lib/amenagement";

export const runtime = "nodejs";

type ModulePlace = {
  module_type_id: string;
  x: number;
  y: number;
  pivote?: boolean;
};

type Atelier = GrilleAtelier & {
  id: string;
  plan_prevu_mois: number | null;
  plan_prevu_cout_centimes: number | null;
};

// 3D-5 : le plan est revalidé et enregistré par le serveur. T3 (horloge réelle) : il entre en
// service amenagement_delai_heures (2 h réelles) après sa sauvegarde (workshops.plan_prevu_le,
// migration 0045), et non plus à la clôture du mois.
// - { workshopId, modules } : enregistre le plan PRÉVU (migration 0037) et paie les modules ajoutés ;
// - { workshopId, annuler: true } : annule le plan prévu et rembourse sa commande.
export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  const body = (await request.json()) as {
    workshopId?: string;
    modules?: unknown;
    annuler?: unknown;
  };

  if (!body.workshopId || typeof body.workshopId !== "string") {
    return NextResponse.json({ error: "workshopId requis." }, { status: 400 });
  }

  // L'atelier de la société, avec sa grille (le plan est revalidé ici, jamais cru sur parole).
  const { data: workshop } = await ctx.supabaseAdmin
    .from("workshops")
    .select("id, largeur_grille, hauteur_grille, entree_x, entree_y, plan_prevu_mois, plan_prevu_cout_centimes")
    .eq("id", body.workshopId)
    .eq("company_id", ctx.companyId)
    .maybeSingle();

  if (!workshop) {
    return NextResponse.json({ error: "Atelier introuvable." }, { status: 404 });
  }
  const atelier = workshop as Atelier;
  const coutPlanPrevu = atelier.plan_prevu_mois === null ? 0 : Number(atelier.plan_prevu_cout_centimes ?? 0);

  if (body.annuler === true) {
    if (atelier.plan_prevu_mois === null) {
      return NextResponse.json({ error: "Aucun plan prévu à annuler." }, { status: 409 });
    }
    const { error } = await ctx.supabaseAdmin.rpc("annuler_amenagement_prevu", {
      p_company_id: ctx.companyId,
      p_workshop_id: atelier.id,
      p_mois_jeu: ctx.moisCourant,
      p_ecriture_id: `amenagement_annulation_${atelier.id}_${randomUUID()}`,
    });
    if (error) {
      return NextResponse.json({ error: "L'annulation du plan prévu a échoué. Réessaie." }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      remboursementCentimes: coutPlanPrevu,
      message: coutPlanPrevu > 0 ? "Plan prévu annulé : sa commande de modules est remboursée." : "Plan prévu annulé.",
    });
  }

  if (!Array.isArray(body.modules)) {
    return NextResponse.json({ error: "modules doit être un tableau." }, { status: 400 });
  }
  const modules = body.modules as ModulePlace[];
  for (const m of modules) {
    if (typeof m.module_type_id !== "string" || !m.module_type_id) {
      return NextResponse.json({ error: "module_type_id manquant ou invalide." }, { status: 400 });
    }
    if (!Number.isInteger(m.x) || !Number.isInteger(m.y)) {
      return NextResponse.json({ error: "x et y doivent être des entiers." }, { status: 400 });
    }
    if (m.pivote !== undefined && typeof m.pivote !== "boolean") {
      return NextResponse.json({ error: "pivote doit être vrai ou faux." }, { status: 400 });
    }
  }

  // Plan en service (le coût se compte par rapport à lui) et matériel au bilan (2154 / 2815).
  const [{ data: actifs }, { data: materiel }] = await Promise.all([
    ctx.supabaseAdmin
      .from("placed_modules")
      .select("module_type_id, x, y, pivote")
      .eq("workshop_id", atelier.id)
      .eq("statut", "actif"),
    ctx.supabaseAdmin
      .from("ledger_entries")
      .select("compte, sens, montant_centimes")
      .eq("company_id", ctx.companyId)
      .in("compte", ["2154", "2815"]),
  ]);

  // Validation du plan par le moteur (validerPlanEtage, coordonnées comptées à partir de 1),
  // prix des modules ajoutés (catalogue modules-v1), retrait de matériel non amorti refusé.
  const decision = deciderAmenagement({
    grille: atelier,
    ancien: (actifs ?? []) as ModuleStocke[],
    nouveau: modules,
    catalogue: chargerModulesV1(),
    tresorerie: ctx.companyTresorerie,
    postesFournis: postesFournisDepuisParametres(chargerParametresV1()),
    valeurNetteMateriel: valeurNetteMaterielEnService(
      (materiel ?? []) as { compte: string; sens: string; montant_centimes: number }[],
      coutPlanPrevu,
    ),
    coutPlanPrevu,
  });
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.message, code: decision.code, erreurs: decision.erreurs },
      { status: 400 },
    );
  }

  // Plan prévu remplacé, commande précédente remboursée et modules ajoutés payés (2154 / 512),
  // dans une seule transaction (0037). Le plan entre en service à prevuLe (0045).
  const maintenant = Date.now();
  const prevuLe = new Date(maintenant + delaiMiseEnPlaceAmenagementMs(chargerParametresV1())).toISOString();
  const argumentsPlan = {
    p_company_id: ctx.companyId,
    p_workshop_id: atelier.id,
    p_modules: modules.map((m) => ({
      module_type_id: m.module_type_id,
      x: m.x,
      y: m.y,
      pivote: m.pivote ?? false,
    })),
    p_cout_centimes: decision.cout,
    p_mois_jeu: ctx.moisCourant,
    p_ecriture_id: `amenagement_${atelier.id}_${randomUUID()}`,
  };
  let { error } = await ctx.supabaseAdmin.rpc("sauvegarder_amenagement", { ...argumentsPlan, p_prevu_le: prevuLe });
  let miseEnPlace = `il sera en place ${versQuand(prevuLe, maintenant)}`;
  // Base pas encore migrée (0045) : l'ancienne fonction, plan appliqué à la clôture comme avant.
  if (fonctionAbsente(error)) {
    ({ error } = await ctx.supabaseAdmin.rpc("sauvegarder_amenagement", argumentsPlan));
    miseEnPlace = "il s'appliquera à la fin du mois de jeu";
  }
  if (error) {
    const refusConcurrent = error.message.startsWith("tresorerie_insuffisante") || error.code === "KP422";
    return NextResponse.json(
      {
        error: refusConcurrent ? "Votre trésorerie a changé pendant la demande : elle ne couvre plus les modules." : error.message,
        ...(refusConcurrent ? { code: "tresorerie_insuffisante" } : {}),
      },
      { status: refusConcurrent ? 400 : 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    coutCentimes: decision.cout,
    remboursementCentimes: decision.remboursement,
    prevuLe,
    message: `Plan enregistré : ${miseEnPlace}.`,
  });
}
