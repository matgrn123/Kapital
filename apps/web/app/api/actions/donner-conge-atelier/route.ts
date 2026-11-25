import { NextResponse } from "next/server";
import { chargerParametresV1 } from "@kapital/content";
import { parametresBailDepuis } from "@kapital/engine";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";
import { localVise } from "../../../../lib/locaux";

export const runtime = "nodejs";

// AE-5 : le congé fixe le dernier mois du bail (mois courant + préavis des paramètres).
// Le loyer reste dû jusqu'à ce mois ; à la clôture de ce mois, le dépôt est restitué.
// 3D-7 : le congé vise un local ({ workshopId }) ; les autres locaux de la société ne bougent pas.
// Sans workshopId, le seul local loué de la société (refus s'il y en a plusieurs).

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  let workshopId: string | undefined;
  try {
    const body = (await request.json()) as { workshopId?: unknown };
    if (typeof body.workshopId === "string") workshopId = body.workshopId;
  } catch {
    // corps absent : le seul local loué
  }

  const { data: locaux } = await ctx.supabaseAdmin
    .from("workshops")
    .select("id, mode_detention")
    .eq("company_id", ctx.companyId)
    .order("cree_le");
  const cible = localVise((locaux ?? []) as { id: string; mode_detention: string }[], workshopId);
  if (!cible.ok) {
    return NextResponse.json({ error: cible.message, code: cible.code }, { status: cible.code === "local_a_preciser" ? 400 : 404 });
  }

  const preavis = parametresBailDepuis(chargerParametresV1()).preavisMois;
  const { data, error } = await ctx.supabaseAdmin.rpc("donner_conge", {
    p_company_id: ctx.companyId,
    p_workshop_id: cible.id,
    p_mois_conge: ctx.moisCourant,
    p_preavis_mois: preavis,
  });
  if (error) {
    if (error.code === "KP404" || error.message.startsWith("aucun_local")) {
      return NextResponse.json({ error: "Ce local n'est pas à vous.", code: "aucun_local" }, { status: 404 });
    }
    if (error.message.startsWith("local_possede")) {
      return NextResponse.json({ error: "Ce local vous appartient : il n'y a pas de bail à quitter.", code: "local_possede" }, { status: 409 });
    }
    if (error.code === "KP409" || error.message.startsWith("conge_deja_donne")) {
      return NextResponse.json({ error: "Un congé est déjà donné pour ce local.", code: "conge_deja_donne" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, workshopId: cible.id, moisFin: data, preavisMois: preavis });
}
