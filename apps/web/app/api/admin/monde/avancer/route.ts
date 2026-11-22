import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { avancerMonde } from "@kapital/server";

// Route de progression du monde : lit l'etat actuel, calcule les ventes du mois
// ecoule, ecrit les ecritures comptables et met a jour le mois courant.
// Appelee automatiquement par pg_cron / cron Vercel toutes les 30 min,
// et manuellement depuis la page admin "Avancer maintenant".

export const runtime = "nodejs";
export const maxDuration = 60;

async function avancer(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 500 });
  }
  const header = request.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
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
    const resultat = await avancerMonde(admin);
    return NextResponse.json({ ok: true, ...resultat });
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = avancer;
export const POST = avancer;
