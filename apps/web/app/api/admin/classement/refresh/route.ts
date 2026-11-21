import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Route de rafraîchissement du classement, appelée toutes les 30 min via
// pg_cron (Supabase) ou en fallback par un cron Vercel.
// Protégée par le secret CRON_SECRET (header Authorization: Bearer <secret>).
// Utilise la clé service_role pour pouvoir exécuter la fonction côté serveur
// sans contexte utilisateur. Cette clé reste côté serveur uniquement.

export const runtime = "nodejs";

async function rafraichir(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré" },
      { status: 500 },
    );
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
  const { data, error } = await admin.rpc("rafraichir_valeurs_entreprises");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, lignes: data });
}

export const GET = rafraichir;
export const POST = rafraichir;
