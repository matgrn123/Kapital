import { NextResponse } from "next/server";
import { chargerParametresV1 } from "@kapital/content";
import { configTempsDepuis } from "@kapital/engine";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  const body = (await request.json()) as {
    supplierId?: string;
    materialId?: string;
    quantite?: number;
  };
  if (!body.supplierId || !body.materialId) {
    return NextResponse.json(
      { error: "supplierId et materialId requis." },
      { status: 400 },
    );
  }
  const quantite = body.quantite ?? 0;
  if (!Number.isFinite(quantite) || quantite <= 0) {
    return NextResponse.json({ error: "Quantité invalide." }, { status: 400 });
  }

  const [fournisseurR, catR] = await Promise.all([
    ctx.supabaseAdmin
      .from("suppliers")
      .select("id, delai_mois, minimum_commande")
      .eq("id", body.supplierId)
      .maybeSingle(),
    ctx.supabaseAdmin
      .from("supplier_catalogue")
      .select("prix_centimes")
      .eq("supplier_id", body.supplierId)
      .eq("material_id", body.materialId)
      .maybeSingle(),
  ]);
  const fournisseur = fournisseurR.data as
    | { id: string; delai_mois: number; minimum_commande: number }
    | null;
  const catalogue = catR.data as { prix_centimes: number } | null;
  if (!fournisseur) {
    return NextResponse.json({ error: "Fournisseur inconnu." }, { status: 404 });
  }
  if (!catalogue) {
    return NextResponse.json(
      { error: "Cette matière n'est pas au catalogue du fournisseur." },
      { status: 404 },
    );
  }
  if (quantite < fournisseur.minimum_commande) {
    return NextResponse.json(
      {
        error: `Minimum du fournisseur : ${fournisseur.minimum_commande}. Vous avez demandé ${quantite}.`,
      },
      { status: 400 },
    );
  }

  // Durée réelle d'un mois de jeu : paramètre temps_minutes_reelles_par_mois_jeu.
  const msParMoisJeu = configTempsDepuis(chargerParametresV1()).minutesReellesParMoisJeu * 60_000;
  const maintenant = new Date();
  const livraison = new Date(maintenant.getTime() + fournisseur.delai_mois * msParMoisJeu);

  const { error } = await ctx.supabaseAdmin.from("purchase_orders").insert({
    company_id: ctx.companyId,
    supplier_id: body.supplierId,
    material_id: body.materialId,
    quantite,
    prix_unitaire_centimes: catalogue.prix_centimes,
    instant_commande: maintenant.toISOString(),
    instant_livraison_prevue: livraison.toISOString(),
    mois_jeu_commande: ctx.moisCourant,
    mois_jeu_livraison: ctx.moisCourant + fournisseur.delai_mois,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
