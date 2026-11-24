import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { approvisionnerStock } from "@kapital/server";
import { creerClientServeur } from "../../../../../lib/supabase/server";

// Route admin-only : approvisionnement manuel du stock d'une entreprise
// cible (identifiée par companyId dans le body). Le joueur n'a pas accès.
// Utilisée en recette uniquement, en attendant le vrai flux T28/T27 (ordres
// de production atelier/façonnier qui alimentent le stock).

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "non authentifié" }, { status: 401 });
  }

  const { data: profil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profil?.role !== "admin") {
    return NextResponse.json({ error: "rôle admin requis" }, { status: 403 });
  }

  const body = (await request.json()) as {
    companyId?: string;
    productId?: string;
    quantite?: number;
  };
  if (!body.companyId || !body.productId || typeof body.quantite !== "number") {
    return NextResponse.json(
      { error: "companyId, productId et quantite requis" },
      { status: 400 },
    );
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
      companyId: body.companyId,
      productId: body.productId,
      quantite: body.quantite,
    });
    return NextResponse.json({ ok: true, ...resultat });
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
