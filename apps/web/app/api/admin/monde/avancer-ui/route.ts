import { NextResponse } from "next/server";
import { avancerMondeMaintenant } from "@kapital/server";
import { exigerAdmin } from "../../../../../lib/admin";

// Variante UI de la route d'avancement : authentification par session Supabase
// avec verification du role admin, pour declenchement depuis la page /admin.
// Elle met le monde à jour à l'instant présent. Aucune date n'est lue dans la
// requête : l'horloge est commune et on ne peut pas faire avancer le temps à la main
// (pour cela, voir /api/admin/monde/avancer-temps, verrouillée en mode recette).

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const acces = await exigerAdmin();
  if (!acces.ok) return acces.reponse;
  try {
    const resultat = await avancerMondeMaintenant(acces.admin, "manuel");
    const erreurs = resultat.entreprises.filter((e) => e.etat === "erreur").length;
    return NextResponse.json({ ok: erreurs === 0, erreurs, ...resultat });
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
