import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { approvisionnerStock } from "@kapital/server";
import { creerClientServeur } from "../../../../lib/supabase/server";

// Approvisionnement manuel du stock pour une entreprise du joueur connecte.
// Simplifie la recette : le joueur peut remplir son stock et vendre sans
// monter d'atelier. A terme, le vrai flux passera par les ordres de production
// atelier/faconnier (T28).

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "non authentifié" }, { status: 401 });
  }

  const body = (await request.json()) as {
    productId?: string;
    quantite?: number;
  };
  if (!body.productId || typeof body.quantite !== "number") {
    return NextResponse.json(
      { error: "productId et quantite requis" },
      { status: 400 },
    );
  }

  const { data: entreprise } = await supabase
    .from("companies")
    .select("id, tresorerie_centimes")
    .eq("owner_profile_id", user.id)
    .maybeSingle();
  if (!entreprise) {
    return NextResponse.json({ error: "aucune entreprise" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Variables Supabase manquantes" },
      { status: 500 },
    );
  }

  const admin = createClient(url, serviceKey);
  try {
    const resultat = await approvisionnerStock(admin, {
      companyId: entreprise.id as string,
      productId: body.productId,
      quantite: body.quantite,
    });
    return NextResponse.json({ ok: true, ...resultat });
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
