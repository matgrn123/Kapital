import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { creerClientServeur } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

const CAPITAL_INITIAL_CENTIMES = 2_000_000; // 20 000 €

export async function POST(request: Request) {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json()) as {
    nom?: string;
    gamme?: "entree" | "milieu" | "haut";
  };
  const nom = (body.nom ?? "").trim();
  const gamme = body.gamme;
  if (!nom) {
    return NextResponse.json({ error: "Nom requis." }, { status: 400 });
  }
  if (gamme !== "entree" && gamme !== "milieu" && gamme !== "haut") {
    return NextResponse.json({ error: "Gamme invalide." }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Variables Supabase manquantes." },
      { status: 500 },
    );
  }
  const admin = createClient(url, serviceKey);

  // Déjà une entreprise ?
  const { data: existing } = await admin
    .from("companies")
    .select("id")
    .eq("owner_profile_id", user.id)
    .limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "Vous avez déjà une entreprise." },
      { status: 409 },
    );
  }

  // Monde actif
  const { data: worlds, error: errWorld } = await admin
    .from("worlds")
    .select("id")
    .eq("etat", "actif")
    .limit(1);
  if (errWorld) {
    return NextResponse.json({ error: errWorld.message }, { status: 500 });
  }
  if (!worlds || worlds.length === 0) {
    return NextResponse.json(
      { error: "Aucun monde actif. L'administrateur doit en créer un." },
      { status: 503 },
    );
  }

  const { error: errIns } = await admin.from("companies").insert({
    world_id: worlds[0]!.id,
    owner_profile_id: user.id,
    nom,
    gamme,
    etape: 0,
    statut: "active",
    tresorerie_centimes: CAPITAL_INITIAL_CENTIMES,
  });
  if (errIns) {
    return NextResponse.json({ error: errIns.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
