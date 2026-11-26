import { NextResponse } from "next/server";
import { chargerBatimentsV1, chargerParametresV1 } from "@kapital/content";
import {
  apercuOuvertureBoutique,
  centimes,
  estEmplacementBoutique,
  moisJeu,
  type EtapeEntreprise,
} from "@kapital/engine";
import { verifierDeblocageEtape } from "@kapital/server";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";
import { fonctionAbsente } from "../../../../lib/rpc";

export const runtime = "nodejs";

// AE-10 : ouvrir une boutique. L'emplacement (loyer, charges, surface) vient du catalogue des
// bâtiments (catégorie boutique), le dépôt, les travaux et leur durée des paramètres boutique_* ;
// le moteur calcule tout (apercuOuvertureBoutique). La fonction SQL ouvrir_boutique enregistre la
// boutique et ses deux écritures (275 / 512 dépôt, 2135 / 512 travaux) dans une seule transaction.
// T3 (horloge réelle) : la boutique ouvre à un instant précis, la signature plus
// boutique_travaux_duree_heures (24 h réelles) ; points_de_vente.ouverture_le (migration 0045).

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
  // AE-11 : l'ouverture se débloque à l'étape 3 (chiffre d'affaires, trésorerie, notoriété) ;
  // le refus détaille ce qui manque. L'emplacement peut aussi demander une étape plus haute.
  const { data: marque } = await ctx.supabaseAdmin
    .from("brand_state")
    .select("notoriete")
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  const verrou = verifierDeblocageEtape("ouverture_boutique", {
    etape: ctx.companyEtape as EtapeEntreprise,
    cumuls: { piecesVendues: ctx.companyPiecesVendues, chiffreAffairesHt: centimes(ctx.companyChiffreAffairesHt) },
    tresorerie: ctx.companyTresorerie,
    notoriete: Number(marque?.notoriete ?? 0),
  });
  if (!verrou.ok) {
    return NextResponse.json(
      { error: verrou.message, code: verrou.code, etapeRequise: verrou.etapeRequise, conditions: verrou.conditions },
      { status: 403 },
    );
  }
  if (batiment.etape_debloquee > ctx.companyEtape) {
    return NextResponse.json(
      {
        error: `Cet emplacement se débloque à l'étape ${batiment.etape_debloquee} (vous êtes à l'étape ${ctx.companyEtape}).`,
        code: "etape_insuffisante",
        etapeRequise: batiment.etape_debloquee,
      },
      { status: 403 },
    );
  }

  const params = chargerParametresV1();
  // Heure du jeu de la signature (en production, l'heure réelle ; en recette, l'outil
  // « avancer le temps » met le jeu en avance) : elle fixe le mois d'ouverture.
  const maintenant = Date.now();
  const signatureJeu = maintenant - ctx.debutReelMs;
  const apercu = apercuOuvertureBoutique({
    batiment,
    params,
    mois: moisJeu(ctx.moisCourant),
    instantMs: signatureJeu,
    tresorerie: centimes(ctx.companyTresorerie),
  });
  // Instant réel de l'ouverture, comme les livraisons : maintenant + durée des travaux.
  const ouvertureLe = new Date(maintenant + (apercu.ouvertureMs - signatureJeu)).toISOString();
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

  const argumentsBoutique = {
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
  };
  let { data, error } = await ctx.supabaseAdmin.rpc("ouvrir_boutique", {
    ...argumentsBoutique,
    p_ouverture_le: ouvertureLe,
  });
  // Base pas encore migrée (0045) : l'ancienne fonction, ouverture au mois comme avant.
  if (fonctionAbsente(error)) {
    ({ data, error } = await ctx.supabaseAdmin.rpc("ouvrir_boutique", argumentsBoutique));
  }
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
    ouvertureLe,
  });
}
