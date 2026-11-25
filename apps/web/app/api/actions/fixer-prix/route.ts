import { NextResponse } from "next/server";
import { validerSaisiePrix } from "@kapital/server";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  const body = (await request.json()) as {
    lignePrixId?: string;
    prixVenteDirecteCentimes?: number;
    prixRevendeurCentimes?: number;
    productionMensuelleCible?: number;
    qualiteVisee?: number;
  };
  if (!body.lignePrixId) {
    return NextResponse.json({ error: "lignePrixId requis." }, { status: 400 });
  }
  const saisie = validerSaisiePrix(body);
  if (!saisie.ok) {
    return NextResponse.json({ error: saisie.message, code: saisie.code }, { status: 400 });
  }
  const { pd, pr, prod, q } = saisie.valeurs;

  // Vérifie que la ligne appartient à l'entreprise du user
  const { data: ligne } = await ctx.supabaseAdmin
    .from("company_products")
    .select("id, company_id")
    .eq("id", body.lignePrixId)
    .maybeSingle();
  if (!ligne || ligne.company_id !== ctx.companyId) {
    return NextResponse.json({ error: "Ligne de prix introuvable." }, { status: 404 });
  }

  const { error } = await ctx.supabaseAdmin
    .from("company_products")
    .update({
      prix_vente_directe_centimes: pd,
      prix_revendeur_centimes: pr,
      production_mensuelle_cible: prod,
      qualite_visee: q,
    })
    .eq("id", body.lignePrixId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
