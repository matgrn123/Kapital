import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { creerSocieteJoueur } from "@kapital/server";
import { ErreurSociete, type Gamme } from "@kapital/engine";
import { creerClientServeur } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

// AE-1 : le joueur crée sa société (SAS, capital de départ fixe, étape 0, sans atelier).
// Le navigateur n'envoie que le nom et la gamme : le capital vient des paramètres.
export async function POST(request: Request) {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = (await request.json()) as { nom?: string; gamme?: string };
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Variables Supabase manquantes." }, { status: 500 });
  }

  try {
    const r = await creerSocieteJoueur(createClient(url, serviceKey), {
      ownerId: user.id,
      nom: body.nom ?? "",
      gamme: body.gamme as Gamme,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ErreurSociete) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const message = (e as Error).message;
    const status = message.includes("societe_existante") ? 409 : 500;
    return NextResponse.json(
      { error: status === 409 ? "Vous avez déjà une société." : message },
      { status },
    );
  }
}
