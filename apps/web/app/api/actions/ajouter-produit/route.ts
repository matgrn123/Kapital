import { NextResponse } from "next/server";
import { lancerSerieDeLancement } from "@kapital/server";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";

export const runtime = "nodejs";

const PRIX_DEFAUT_PAR_GAMME: Record<string, { tt: number; gros: number }> = {
  entree: { tt: 2000, gros: 1000 },
  milieu: { tt: 6000, gros: 3000 },
  haut: { tt: 15000, gros: 7500 },
};

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  const body = (await request.json()) as { productId?: string };
  if (!body.productId) {
    return NextResponse.json({ error: "productId requis." }, { status: 400 });
  }

  // Produit existant ?
  const { data: produit } = await ctx.supabaseAdmin
    .from("products")
    .select("id")
    .eq("id", body.productId)
    .maybeSingle();
  if (!produit) {
    return NextResponse.json({ error: "Produit inconnu." }, { status: 404 });
  }

  // Déjà au catalogue ?
  const { data: existante } = await ctx.supabaseAdmin
    .from("company_products")
    .select("id")
    .eq("company_id", ctx.companyId)
    .eq("product_id", body.productId)
    .maybeSingle();
  if (existante) {
    return NextResponse.json(
      { error: "Produit déjà au catalogue." },
      { status: 409 },
    );
  }

  // Premier produit de la société : elle naît avec une série de lancement prête à vendre (TP-3).
  const { count: nbProduits } = await ctx.supabaseAdmin
    .from("company_products")
    .select("id", { count: "exact", head: true })
    .eq("company_id", ctx.companyId);

  const defaut = PRIX_DEFAUT_PAR_GAMME[ctx.companyGamme]!;
  const { error } = await ctx.supabaseAdmin.from("company_products").insert({
    company_id: ctx.companyId,
    product_id: body.productId,
    qualite_visee: 60,
    prix_vente_directe_centimes: defaut.tt,
    prix_revendeur_centimes: defaut.gros,
    production_mensuelle_cible: 100,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if ((nbProduits ?? 0) === 0) {
    try {
      const serie = await lancerSerieDeLancement(ctx.supabaseAdmin, {
        companyId: ctx.companyId,
        productId: body.productId,
        moisCourant: ctx.moisCourant,
      });
      return NextResponse.json({ ok: true, serieLancement: serie });
    } catch (e) {
      // Le produit est ajouté ; la série n'a pas pu être faite (trésorerie insuffisante...).
      return NextResponse.json({ ok: true, serieLancement: null, avertissement: (e as Error).message });
    }
  }
  return NextResponse.json({ ok: true });
}
