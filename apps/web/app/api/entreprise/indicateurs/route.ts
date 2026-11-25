import { NextResponse } from "next/server";
import { chargerParametresV1 } from "@kapital/content";
import {
  chargerLignesGrandLivreSupabase,
  lireIndicateursEntreprise,
  StockageSupabase,
} from "@kapital/server";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";

// AE-3 : indicateurs de gestion de l'entreprise du joueur (marge par canal, point mort,
// besoin en fonds de roulement, prévisionnel à 3 mois, endettement). Lecture seule.

export const runtime = "nodejs";

export async function GET() {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  try {
    const stockage = new StockageSupabase(ctx.supabaseAdmin);
    const indicateurs = await lireIndicateursEntreprise(
      {
        chargerEtat: (id, mois) => stockage.chargerEtat(id, mois),
        chargerLignesGrandLivre: (id) => chargerLignesGrandLivreSupabase(ctx.supabaseAdmin, id),
      },
      chargerParametresV1(),
      { companyId: ctx.companyId, moisCourant: ctx.moisCourant },
    );
    return NextResponse.json(indicateurs, { headers: { "Cache-Control": "no-store" } });
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
