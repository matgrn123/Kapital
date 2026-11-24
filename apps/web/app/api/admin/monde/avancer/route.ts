import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { simulerMondeComplet } from "@kapital/server";

// Clôture mensuelle complète : livraisons, production, ventes, charges, TVA,
// prêts, découvert, IS. Idempotente via la table clotures.
// Appelée par le cron Vercel quotidien et manuellement depuis /admin.

export const runtime = "nodejs";
export const maxDuration = 300;

async function cloturer(request: Request) {
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
    const resultat = await simulerMondeComplet(admin);
    return NextResponse.json({ ok: true, ...resultat });
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = cloturer;
export const POST = cloturer;
