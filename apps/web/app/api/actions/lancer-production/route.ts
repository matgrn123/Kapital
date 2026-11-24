import { NextResponse } from "next/server";
import { chargerContexte, estErreurAction, refuserSiVerrouille } from "../../../../lib/api-helpers";

export const runtime = "nodejs";

const HEURES_PAR_MOIS_JEU = 24;

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  const body = (await request.json()) as {
    productId?: string;
    quantite?: number;
    lieuType?: "atelier" | "faconnier";
    faconnierId?: string;
  };
  if (!body.productId || !body.lieuType) {
    return NextResponse.json(
      { error: "productId et lieuType requis." },
      { status: 400 },
    );
  }
  const quantite = body.quantite ?? 0;
  if (!Number.isFinite(quantite) || quantite <= 0) {
    return NextResponse.json({ error: "Quantité invalide." }, { status: 400 });
  }

  if (body.lieuType === "atelier") {
    const verrou = refuserSiVerrouille(ctx, "production_atelier");
    if (verrou) return verrou;
    const { data: atelier } = await ctx.supabaseAdmin
      .from("workshops")
      .select("id")
      .eq("company_id", ctx.companyId)
      .maybeSingle();
    if (!atelier) {
      return NextResponse.json(
        { error: "Votre entreprise n'a pas d'atelier propre." },
        { status: 400 },
      );
    }
    const maintenant = new Date();
    const livraison = new Date(maintenant.getTime() + HEURES_PAR_MOIS_JEU * 3600 * 1000);
    const { error } = await ctx.supabaseAdmin.from("production_orders").insert({
      company_id: ctx.companyId,
      product_id: body.productId,
      quantite,
      lieu_type: "atelier",
      instant_commande: maintenant.toISOString(),
      instant_livraison_prevue: livraison.toISOString(),
      mois_jeu_commande: ctx.moisCourant,
      mois_jeu_livraison: ctx.moisCourant + 1,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Façonnier
  if (!body.faconnierId) {
    return NextResponse.json({ error: "faconnierId requis." }, { status: 400 });
  }
  const [facR, catR] = await Promise.all([
    ctx.supabaseAdmin
      .from("faconniers")
      .select("id, delai_mois, minimum_commande")
      .eq("id", body.faconnierId)
      .maybeSingle(),
    ctx.supabaseAdmin
      .from("faconnier_catalogue")
      .select("prix_par_piece_centimes")
      .eq("faconnier_id", body.faconnierId)
      .eq("product_id", body.productId)
      .maybeSingle(),
  ]);
  const fac = facR.data as
    | { id: string; delai_mois: number; minimum_commande: number }
    | null;
  const catalogue = catR.data as { prix_par_piece_centimes: number } | null;
  if (!fac) {
    return NextResponse.json({ error: "Façonnier inconnu." }, { status: 404 });
  }
  if (!catalogue) {
    return NextResponse.json(
      { error: "Ce façonnier ne fait pas ce produit." },
      { status: 404 },
    );
  }
  if (quantite < fac.minimum_commande) {
    return NextResponse.json(
      { error: `Minimum du façonnier : ${fac.minimum_commande}.` },
      { status: 400 },
    );
  }

  const maintenant = new Date();
  const livraison = new Date(
    maintenant.getTime() + fac.delai_mois * HEURES_PAR_MOIS_JEU * 3600 * 1000,
  );
  const { error } = await ctx.supabaseAdmin.from("production_orders").insert({
    company_id: ctx.companyId,
    product_id: body.productId,
    quantite,
    lieu_type: "faconnier",
    faconnier_id: body.faconnierId,
    prix_facon_par_piece_centimes: catalogue.prix_par_piece_centimes,
    instant_commande: maintenant.toISOString(),
    instant_livraison_prevue: livraison.toISOString(),
    mois_jeu_commande: ctx.moisCourant,
    mois_jeu_livraison: ctx.moisCourant + fac.delai_mois,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
