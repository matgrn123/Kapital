import { NextResponse } from "next/server";
import { passerCommandeGrossiste } from "@kapital/server";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";

export const runtime = "nodejs";

// TP-3 : le grossiste local livre le jour même, plus cher que l'usine.
// Le prix et le délai sont calculés côté serveur à partir des paramètres ;
// le navigateur n'envoie que le produit et la quantité.
export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  const body = (await request.json()) as { productId?: string; quantite?: number };
  if (!body.productId) {
    return NextResponse.json({ error: "productId requis." }, { status: 400 });
  }
  const quantite = body.quantite ?? 0;
  if (!Number.isInteger(quantite) || quantite <= 0) {
    return NextResponse.json({ error: "Quantité invalide." }, { status: 400 });
  }

  const { data: ligne } = await ctx.supabaseAdmin
    .from("company_products")
    .select("id")
    .eq("company_id", ctx.companyId)
    .eq("product_id", body.productId)
    .maybeSingle();
  if (!ligne) {
    return NextResponse.json(
      { error: "Ce produit n'est pas dans votre catalogue." },
      { status: 404 },
    );
  }

  try {
    const r = await passerCommandeGrossiste(ctx.supabaseAdmin, {
      companyId: ctx.companyId,
      productId: body.productId,
      quantite,
      moisCourant: ctx.moisCourant,
      maintenant: new Date(),
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
