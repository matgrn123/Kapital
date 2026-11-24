import { NextResponse } from "next/server";
import { chargerParametresV1 } from "@kapital/content";
import { chargerDonneesCockpit, construireVueCockpit } from "@kapital/server";
import { exigerAdmin, reglagesRecette } from "../../../../lib/admin";

// Ce que le cockpit d'administration affiche : horloge, entreprises, minuterie, commandes.
// Lecture seule, réservée aux administrateurs.

export const runtime = "nodejs";

export async function GET() {
  const acces = await exigerAdmin();
  if (!acces.ok) return acces.reponse;
  try {
    const donnees = await chargerDonneesCockpit(acces.admin);
    const vue = construireVueCockpit(donnees, chargerParametresV1(), Date.now());
    const { modeRecette, codeAttendu } = reglagesRecette();
    return NextResponse.json(
      { ...vue, maintenantMs: Date.now(), modeRecette, codeConfigure: Boolean(codeAttendu) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
