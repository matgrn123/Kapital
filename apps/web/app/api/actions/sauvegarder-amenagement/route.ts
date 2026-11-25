import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { chargerModulesV1 } from "@kapital/content";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";
import { deciderAmenagement, type GrilleAtelier, type ModuleStocke } from "../../../../lib/amenagement";

export const runtime = "nodejs";

type ModulePlace = {
  module_type_id: string;
  x: number;
  y: number;
  pivote?: boolean;
};

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  const body = (await request.json()) as {
    workshopId?: string;
    modules?: unknown;
  };

  if (!body.workshopId || typeof body.workshopId !== "string") {
    return NextResponse.json({ error: "workshopId requis." }, { status: 400 });
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
  }

  // L'atelier de la société, avec sa grille (le plan est revalidé ici, jamais cru sur parole).
  const { data: workshop } = await ctx.supabaseAdmin
    .from("workshops")
    .select("id, largeur_grille, hauteur_grille, entree_x, entree_y")
    .eq("id", body.workshopId)
    .eq("company_id", ctx.companyId)
    .maybeSingle();

  if (!workshop) {
    return NextResponse.json({ error: "Atelier introuvable." }, { status: 404 });
  }

  const { data: existants } = await ctx.supabaseAdmin
    .from("placed_modules")
    .select("module_type_id, x, y, pivote")
    .eq("workshop_id", body.workshopId);

  // Validation du plan par le moteur (validerPlanEtage, coordonnées comptées à partir de 1)
  // et prix des modules ajoutés (catalogue modules-v1).
  const decision = deciderAmenagement({
    grille: workshop as GrilleAtelier,
    ancien: (existants ?? []) as ModuleStocke[],
    nouveau: modules,
    catalogue: chargerModulesV1(),
    tresorerie: ctx.companyTresorerie,
  });
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.message, code: decision.code, erreurs: decision.erreurs },
      { status: 400 },
    );
  }

  // Plan remplacé et modules ajoutés payés (2154 / 512) dans une seule transaction (0031).
  const { error } = await ctx.supabaseAdmin.rpc("sauvegarder_amenagement", {
    p_company_id: ctx.companyId,
    p_workshop_id: body.workshopId,
    p_modules: modules.map((m) => ({
      module_type_id: m.module_type_id,
      x: m.x,
      y: m.y,
      pivote: m.pivote ?? false,
    })),
    p_cout_centimes: decision.cout,
    p_mois_jeu: ctx.moisCourant,
    p_ecriture_id: `amenagement_${body.workshopId}_${randomUUID()}`,
  });
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

  return NextResponse.json({ ok: true, coutCentimes: decision.cout });
}
