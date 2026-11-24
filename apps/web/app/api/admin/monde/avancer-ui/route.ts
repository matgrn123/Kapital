import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { avancerMondeMaintenant } from "@kapital/server";
import { creerClientServeur } from "../../../../../lib/supabase/server";

// Variante UI de la route d'avancement : authentification par session Supabase
// avec verification du role admin, pour declenchement depuis la page /admin.
// Elle met le monde à jour à l'instant présent. Aucune date n'est lue dans la
// requête : l'horloge est commune et on ne peut pas faire avancer le temps à la main.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
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
    return NextResponse.json({ error: "role admin requis" }, { status: 403 });
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
