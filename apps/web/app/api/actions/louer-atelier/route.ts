import { NextResponse } from "next/server";
import { chargerBatimentsV1, chargerParametresV1 } from "@kapital/content";
import { centimes, moisJeu, nouveauBail, parametresBailDepuis } from "@kapital/engine";
import { chargerContexte, estErreurAction, refuserSiVerrouille } from "../../../../lib/api-helpers";

export const runtime = "nodejs";

// AE-5 : le local, son loyer, ses charges viennent du catalogue des bâtiments ; le dépôt de
// garantie et le nombre de machines des paramètres. La fonction SQL signer_bail enregistre le
// local et l'écriture du dépôt (275 / 512) dans une seule transaction.

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;
  const verrou = refuserSiVerrouille(ctx, "louer_atelier");
  if (verrou) return verrou;

  let batimentId = "petit_atelier";
  try {
    const body = (await request.json()) as { batimentId?: unknown };
    if (typeof body.batimentId === "string") batimentId = body.batimentId;
  } catch {
    // corps absent : bâtiment par défaut
  }
  const batiment = chargerBatimentsV1().find((b) => b.id === batimentId && b.categorie === "atelier");
  if (!batiment) {
    return NextResponse.json({ error: "Local inconnu.", code: "batiment_inconnu" }, { status: 400 });
  }
  if (batiment.etape_debloquee > ctx.companyEtape) {
    return NextResponse.json(
      {
        error: `Ce local se débloque à l'étape ${batiment.etape_debloquee} (vous êtes à l'étape ${ctx.companyEtape}).`,
        code: "etape_insuffisante",
      },
      { status: 403 },
    );
  }

  const params = chargerParametresV1();
  const bail = nouveauBail({
    loyerMensuel: centimes(batiment.loyer_mensuel_centimes),
    chargesMensuelles: centimes(batiment.charges_mensuelles_centimes),
    moisSignature: moisJeu(ctx.moisCourant),
    params,
  });
  if (ctx.companyTresorerie < bail.depotGarantie) {
    const manque = bail.depotGarantie - ctx.companyTresorerie;
    return NextResponse.json(
      {
        error: `Trésorerie insuffisante pour le dépôt de garantie de ${(bail.depotGarantie / 100).toFixed(2)} € : il manque ${(manque / 100).toFixed(2)} €.`,
        code: "depot_insuffisant",
        depotGarantieCentimes: bail.depotGarantie,
        manqueCentimes: manque,
      },
      { status: 400 },
    );
  }

  const { error } = await ctx.supabaseAdmin.rpc("signer_bail", {
    p_company_id: ctx.companyId,
    p_batiment_id: batiment.id,
    p_surface_m2: batiment.surface_m2,
    p_loyer_centimes: batiment.loyer_mensuel_centimes,
    p_charges_centimes: bail.chargesMensuelles,
    p_depot_centimes: bail.depotGarantie,
    p_nombre_machines: parametresBailDepuis(params).machinesALaSignature,
    p_mois_jeu: ctx.moisCourant,
  });
  if (error) {
    if (error.code === "KP409" || error.message.startsWith("local_deja_loue")) {
      return NextResponse.json({ error: "Vous avez déjà un atelier." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, depotGarantieCentimes: bail.depotGarantie });
}
