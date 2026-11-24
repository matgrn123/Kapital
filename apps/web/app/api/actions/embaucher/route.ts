import { NextResponse } from "next/server";
import { chargerContexte, estErreurAction, refuserSiVerrouille } from "../../../../lib/api-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;
  const verrou = refuserSiVerrouille(ctx, "embauche");
  if (verrou) return verrou;

  const body = (await request.json()) as {
    poste?: "artisan" | "encadrement";
    salaireBrutMensuelCentimes?: number;
  };
  const poste = body.poste;
  const salaire = body.salaireBrutMensuelCentimes ?? 0;
  if (poste !== "artisan" && poste !== "encadrement") {
    return NextResponse.json({ error: "Poste invalide." }, { status: 400 });
  }
  if (!Number.isFinite(salaire) || salaire <= 0) {
    return NextResponse.json({ error: "Salaire invalide." }, { status: 400 });
  }
  const { error } = await ctx.supabaseAdmin.from("employees").insert({
    company_id: ctx.companyId,
    poste,
    salaire_brut_mensuel_centimes: salaire,
    mois_jeu_debut: ctx.moisCourant,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
