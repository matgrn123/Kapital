import { NextResponse } from "next/server";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";
import { instantVu } from "../../../../lib/journal";

export const runtime = "nodejs";

/**
 * Le joueur a vu son journal (carte « Pendant ton absence », page Journal) jusqu'à l'instant
 * où la page a été calculée. Écrit companies.derniere_visite_le avec la clé de service
 * (le navigateur n'écrit jamais en base) ; la date ne recule jamais.
 */
export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  let body: { jusqua?: unknown } = {};
  try {
    body = (await request.json()) as { jusqua?: unknown };
  } catch {
    // corps vide : traité comme une date absente
  }
  const vu = instantVu(body.jusqua, Date.now());
  if (vu === null) return NextResponse.json({ error: "Date de visite invalide." }, { status: 400 });

  const { error } = await ctx.supabaseAdmin
    .from("companies")
    .update({ derniere_visite_le: vu })
    .eq("id", ctx.companyId)
    .or(`derniere_visite_le.is.null,derniere_visite_le.lt."${vu}"`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, derniereVisite: vu });
}
