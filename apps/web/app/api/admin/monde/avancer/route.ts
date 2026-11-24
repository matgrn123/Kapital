import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { avancerMondeMaintenant } from "@kapital/server";

// Met tout le monde à jour à l'instant présent : chaque entreprise traite les pas
// (1 minute réelle) qui lui manquent, absents compris. Idempotent : un pas déjà
// traité n'est jamais rejoué. Appelée chaque minute par la minuterie Supabase
// (migration 0021) et une fois par jour par le cron Vercel, en filet de sécurité.

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
    const resultat = await avancerMondeMaintenant(admin);
    const erreurs = resultat.entreprises.filter((e) => e.etat === "erreur").length;
    return NextResponse.json({ ok: erreurs === 0, erreurs, ...resultat });
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = cloturer;
export const POST = cloturer;
