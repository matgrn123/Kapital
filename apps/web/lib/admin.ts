import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { creerClientServeur } from "./supabase/server";

// Garde commune des routes d'administration : session Supabase + rôle admin.
// Les écritures passent ensuite par un client à clé de service, côté serveur seulement.

export type AccesAdmin =
  | { readonly ok: true; readonly userId: string; readonly admin: SupabaseClient }
  | { readonly ok: false; readonly reponse: NextResponse };

export async function exigerAdmin(): Promise<AccesAdmin> {
  const session = await creerClientServeur();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) {
    return { ok: false, reponse: NextResponse.json({ error: "non authentifié" }, { status: 401 }) };
  }
  const { data: profil } = await session
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profil?.role !== "admin") {
    return { ok: false, reponse: NextResponse.json({ error: "role admin requis" }, { status: 403 }) };
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return {
      ok: false,
      reponse: NextResponse.json({ error: "Variables Supabase manquantes" }, { status: 500 }),
    };
  }
  return { ok: true, userId: user.id, admin: createClient(url, serviceKey) };
}

/** Réglages du mode recette : lus côté serveur, jamais envoyés au navigateur (sauf deux booléens). */
export function reglagesRecette(): { modeRecette: boolean; codeAttendu: string | undefined } {
  return {
    modeRecette: process.env.KAPITAL_MODE_RECETTE === "true",
    codeAttendu: process.env.KAPITAL_ADMIN_CODE,
  };
}
