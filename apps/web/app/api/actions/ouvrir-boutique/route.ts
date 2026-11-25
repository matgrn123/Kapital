import { NextResponse } from "next/server";
import { chargerBatimentsV1, chargerParametresV1 } from "@kapital/content";
import { apercuOuvertureBoutique, centimes, estEmplacementBoutique, moisJeu } from "@kapital/engine";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";

export const runtime = "nodejs";

// AE-10 : ouvrir une boutique. L'emplacement (loyer, charges, surface) vient du catalogue des
// bâtiments (catégorie boutique), le dépôt, les travaux et leur durée des paramètres boutique_* ;
// le moteur calcule tout (apercuOuvertureBoutique). La fonction SQL ouvrir_boutique enregistre la
// boutique et ses deux écritures (275 / 512 dépôt, 2135 / 512 travaux) dans une seule transaction.
// La boutique ouvre après les travaux (mois de signature + boutique_travaux_duree_mois).

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  let batimentId: unknown;
  try {
    batimentId = ((await request.json()) as { batimentId?: unknown }).batimentId;
  } catch {
    batimentId = undefined;
  }
  const batiment = chargerBatimentsV1().find((b) => b.id === batimentId);
  if (!batiment || !estEmplacementBoutique(batiment)) {
    return NextResponse.json({ error: "Emplacement de boutique inconnu.", code: "batiment_inconnu" }, { status: 400 });
  }
  if (batiment.etape_debloquee > ctx.companyEtape) {
    return NextResponse.json(
      {
        error: `La boutique se débloque à l'étape ${batiment.etape_debloquee} (vous êtes à l'étape ${ctx.companyEtape}).`,
        code: "etape_insuffisante",
        etapeRequise: batiment.etape_debloquee,
      },
      { status: 403 },
    );
  }

  const params = chargerParametresV1();
  const apercu = apercuOuvertureBoutique({
    batiment,
    params,
    mois: moisJeu(ctx.moisCourant),
    tresorerie: centimes(ctx.companyTresorerie),
  });
  if (!apercu.tresorerieSuffisante) {
    return NextResponse.json(
      {
        error: `Trésorerie insuffisante : dépôt de garantie et travaux coûtent ${(apercu.totalALaSignature / 100).toFixed(2)} €, il manque ${(apercu.manque / 100).toFixed(2)} €.`,
        code: "tresorerie_insuffisante",
        totalALaSignatureCentimes: apercu.totalALaSignature,
        manqueCentimes: apercu.manque,
      },
      { status: 400 },
    );
  }

  const { data, error } = await ctx.supabaseAdmin.rpc("ouvrir_boutique", {
    p_company_id: ctx.companyId,
    p_batiment_id: batiment.id,
    p_surface_m2: apercu.surfaceM2,
    p_loyer_centimes: apercu.loyerMensuel,
    p_charges_centimes: apercu.chargesMensuelles,
    p_depot_centimes: apercu.depotGarantie,
    p_travaux_centimes: apercu.travaux,
    p_duree_amortissement_mois: params["boutique_amortissement_agencement_mois"]!.valeur,
    p_mois_signature: apercu.moisSignature,
    p_mois_ouverture: apercu.moisOuverture,
  });
  if (error) {
    if (error.message.startsWith("boutique_deja_ouverte")) {
      return NextResponse.json({ error: "Vous avez déjà une boutique.", code: "boutique_deja_ouverte" }, { status: 409 });
    }
    if (error.message.startsWith("tresorerie_insuffisante")) {
      return NextResponse.json(
        { error: "Trésorerie insuffisante pour le dépôt de garantie et les travaux.", code: "tresorerie_insuffisante" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    pointDeVenteId: data as string,
    depotGarantieCentimes: apercu.depotGarantie,
    travauxCentimes: apercu.travaux,
    moisOuverture: apercu.moisOuverture,
  });
}
