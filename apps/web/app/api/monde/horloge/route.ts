import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { chargerParametresV1 } from "@kapital/content";
import { lireHorloge, StockageSupabase } from "@kapital/server";
import { creerClientServeur } from "../../../../lib/supabase/server";

// Horloge commune du monde : la même date de jeu pour tous les joueurs.
// Lecture seule. L'instant vient de l'horloge du serveur ; la requête ne peut
// transmettre aucune date (query et corps sont ignorés).

export const runtime = "nodejs";

export async function GET() {
  const session = await creerClientServeur();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "non authentifié" }, { status: 401 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Variables Supabase manquantes" }, { status: 500 });
  }

  try {
    const horloge = await lireHorloge(
      new StockageSupabase(createClient(url, serviceKey)),
      chargerParametresV1(),
      Date.now(),
    );
    return NextResponse.json(horloge, { headers: { "Cache-Control": "no-store" } });
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
