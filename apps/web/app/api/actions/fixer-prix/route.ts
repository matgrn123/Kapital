import { NextResponse } from "next/server";
import { validerSaisiePrix } from "@kapital/server";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";
import { lirePrixBoutique } from "../../../(authentifie)/magasin/donnees";

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
    /** AE-11 : prix TTC en boutique ; null = reprendre le prix de la vente directe. */
    prixBoutiqueCentimes?: number | null;
  };
  if (!body.lignePrixId) {
    return NextResponse.json({ error: "lignePrixId requis." }, { status: 400 });
  }

  // AE-11 : prix boutique seul (écran Magasin). Les autres prix ne sont pas touchés.
  if ("prixBoutiqueCentimes" in body && body.prixVenteDirecteCentimes === undefined) {
    const prix = lirePrixBoutique(body.prixBoutiqueCentimes);
    if (!prix.ok) return NextResponse.json({ error: prix.message, code: "prix_invalide" }, { status: 400 });
    const { data: ligneBoutique } = await ctx.supabaseAdmin
      .from("company_products")
      .select("id, company_id")
      .eq("id", body.lignePrixId)
      .maybeSingle();
    if (!ligneBoutique || ligneBoutique.company_id !== ctx.companyId) {
      return NextResponse.json({ error: "Ligne de prix introuvable." }, { status: 404 });
    }
    const { error: erreurBoutique } = await ctx.supabaseAdmin
      .from("company_products")
      .update({ prix_boutique_centimes: prix.valeur })
      .eq("id", body.lignePrixId);
    if (erreurBoutique) return NextResponse.json({ error: erreurBoutique.message }, { status: 500 });
    return NextResponse.json({ ok: true, prixBoutiqueCentimes: prix.valeur });
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
