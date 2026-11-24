import { NextResponse } from "next/server";
import { chargerParametresV1 } from "@kapital/content";
import { parametresBailDepuis } from "@kapital/engine";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";

export const runtime = "nodejs";

// AE-5 : le congé fixe le dernier mois du bail (mois courant + préavis des paramètres).
// Le loyer reste dû jusqu'à ce mois ; à la clôture de ce mois, le dépôt est restitué.

export async function POST() {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  const preavis = parametresBailDepuis(chargerParametresV1()).preavisMois;
  const { data, error } = await ctx.supabaseAdmin.rpc("donner_conge", {
    p_company_id: ctx.companyId,
    p_mois_conge: ctx.moisCourant,
    p_preavis_mois: preavis,
  });
  if (error) {
    if (error.code === "KP404" || error.message.startsWith("aucun_local")) {
      return NextResponse.json({ error: "Vous n'avez aucun local loué.", code: "aucun_local" }, { status: 404 });
    }
    if (error.code === "KP409" || error.message.startsWith("conge_deja_donne")) {
      return NextResponse.json({ error: "Un congé est déjà donné.", code: "conge_deja_donne" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, moisFin: data, preavisMois: preavis });
}
