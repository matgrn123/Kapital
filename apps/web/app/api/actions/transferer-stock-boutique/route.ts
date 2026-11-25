import { NextResponse } from "next/server";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";

export const runtime = "nodejs";

// AE-10 : envoyer des pièces du stock de l'atelier vers la boutique. La fonction SQL
// transferer_stock_boutique les déplace au coût moyen (même formule que le moteur,
// valeurSortieCmp), sous le verrou de la société, sans écriture : les deux stocks sont au
// compte 35. Permis pendant les travaux, pour préparer l'ouverture.

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  let body: { pointDeVenteId?: unknown; produitId?: unknown; quantite?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const { pointDeVenteId, produitId, quantite } = body;
  if (typeof pointDeVenteId !== "string" || typeof produitId !== "string") {
    return NextResponse.json({ error: "Boutique ou produit manquant.", code: "requete_invalide" }, { status: 400 });
  }
  if (typeof quantite !== "number" || !Number.isInteger(quantite) || quantite <= 0) {
    return NextResponse.json(
      { error: "La quantité à transférer doit être un entier positif.", code: "quantite_invalide" },
      { status: 400 },
    );
  }

  const { data, error } = await ctx.supabaseAdmin.rpc("transferer_stock_boutique", {
    p_company_id: ctx.companyId,
    p_point_de_vente_id: pointDeVenteId,
    p_product_id: produitId,
    p_quantite: quantite,
  });
  if (error) {
    if (error.message.startsWith("stock_insuffisant")) {
      const dispo = /(\d+) disponibles/.exec(error.message)?.[1] ?? "0";
      return NextResponse.json(
        { error: `Stock de l'atelier insuffisant : ${dispo} pièce(s) disponible(s).`, code: "stock_insuffisant" },
        { status: 400 },
      );
    }
    if (error.message.startsWith("boutique_introuvable")) {
      return NextResponse.json({ error: "Cette boutique n'existe pas.", code: "boutique_introuvable" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const r = data as { quantite: number; valeur_centimes: number };
  return NextResponse.json({ ok: true, quantite: r.quantite, valeurCentimes: r.valeur_centimes });
}
