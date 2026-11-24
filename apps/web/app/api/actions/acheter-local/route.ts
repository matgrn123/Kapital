import { NextResponse } from "next/server";
import { chargerBatimentsV1, chargerParametresV1 } from "@kapital/content";
import {
  acheterLocal,
  apportMinimal,
  centimes,
  moisJeu,
  parametresAchatDepuis,
  parametresBailDepuis,
  reglesPretDepuis,
} from "@kapital/engine";
import { chargerContexte, estErreurAction, refuserSiVerrouille } from "../../../../lib/api-helpers";

export const runtime = "nodejs";

// AE-6 : achat d'un local à crédit. Le prix et l'entretien viennent du catalogue des bâtiments,
// l'apport minimal et les durées des paramètres, le prêt suit les règles de l'objet « immobilier »
// (AE-4). Le moteur décide (acheterLocal) ; la fonction SQL acheter_local enregistre le prêt, son
// échéancier, le local et les écritures (512/164 puis 213/512) dans une seule transaction.

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;
  const verrou = refuserSiVerrouille(ctx, "achat_local");
  if (verrou) return verrou;

  let body: { batimentId?: unknown; apportCentimes?: unknown; dureeMois?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // corps absent : bâtiment par défaut, apport et durée par défaut
  }
  const batimentId = typeof body.batimentId === "string" ? body.batimentId : "petit_atelier";
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
  const apport = body.apportCentimes === undefined ? undefined : Number(body.apportCentimes);
  const dureePret = body.dureeMois === undefined ? undefined : Number(body.dureeMois);
  if ((apport !== undefined && !Number.isInteger(apport)) || (dureePret !== undefined && !Number.isInteger(dureePret))) {
    return NextResponse.json({ error: "Apport ou durée invalide.", code: "montant_invalide" }, { status: 400 });
  }

  const { data: atelier } = await ctx.supabaseAdmin
    .from("workshops")
    .select("id")
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  const { data: prets } = await ctx.supabaseAdmin
    .from("loans")
    .select("capital_restant_centimes")
    .eq("company_id", ctx.companyId)
    .eq("statut", "actif");
  const detteEnCours = ((prets ?? []) as Array<{ capital_restant_centimes: number }>).reduce(
    (s, p) => s + Number(p.capital_restant_centimes),
    0,
  );

  const params = chargerParametresV1();
  const regles = reglesPretDepuis(params);
  // €STR du mois : dernière valeur connue ; à défaut, la valeur de secours des paramètres.
  const aujourdhui = new Date();
  const { data: estrLigne } = await ctx.supabaseAdmin
    .from("market_data")
    .select("valeur")
    .eq("donnee", "estr_annuel")
    .lte("date_effet", aujourdhui.toISOString().slice(0, 10))
    .order("date_effet", { ascending: false })
    .limit(1)
    .maybeSingle();
  const estrLu = Number((estrLigne as { valeur?: unknown } | null)?.valeur);
  const estr = Number.isFinite(estrLu) ? estrLu : regles.estrDeSecoursAnnuel;

  const minutesParMoisJeu = params["temps_minutes_reelles_par_mois_jeu"]?.valeur;
  if (!minutesParMoisJeu || minutesParMoisJeu <= 0) {
    return NextResponse.json({ error: "Paramètre de temps manquant." }, { status: 500 });
  }

  const decision = acheterLocal({
    idEntreprise: ctx.companyId,
    mois: moisJeu(ctx.moisCourant),
    batiment: {
      id: batiment.id,
      surfaceM2: batiment.surface_m2,
      prixAchat: centimes(batiment.prix_achat_centimes),
      chargesMensuelles: centimes(batiment.charges_mensuelles_centimes),
    },
    apport: apport === undefined ? undefined : centimes(apport),
    dureePretMois: dureePret,
    tauxEstrAnnuel: estr,
    tresorerie: centimes(ctx.companyTresorerie),
    detteEnCours: centimes(detteEnCours),
    aDejaUnLocal: atelier !== null,
    params,
  });
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.message, code: decision.code, manqueCentimes: decision.manque },
      { status: decision.code === "local_deja_detenu" ? 409 : 400 },
    );
  }

  const lignes = decision.echeancier.map((ech) => ({
    numero: ech.numero,
    mensualite_centimes: ech.montant,
    interets_centimes: ech.interets,
    amortissement_centimes: ech.amortissement,
    capital_restant_apres_centimes: ech.capitalRestantApres,
    instant_prevu: new Date(aujourdhui.getTime() + ech.numero * minutesParMoisJeu * 60_000).toISOString(),
  }));

  const { data: idLocal, error } = await ctx.supabaseAdmin.rpc("acheter_local", {
    p_company_id: ctx.companyId,
    p_batiment_id: batiment.id,
    p_surface_m2: batiment.surface_m2,
    p_prix_centimes: batiment.prix_achat_centimes,
    p_apport_centimes: decision.apport,
    p_apport_minimal_centimes: apportMinimal(centimes(batiment.prix_achat_centimes), parametresAchatDepuis(params)),
    p_charges_centimes: batiment.charges_mensuelles_centimes,
    p_nombre_machines: parametresBailDepuis(params).machinesALaSignature,
    p_duree_amortissement_mois: decision.achat.dureeAmortissementMois,
    p_mois_jeu: ctx.moisCourant,
    p_taux_annuel: decision.tauxAnnuel,
    p_duree_pret_mois: decision.dureePretMois,
    p_instant_debut: aujourdhui.toISOString(),
    p_plafond_endettement_centimes: decision.plafondEndettement,
    p_echeancier: lignes,
  });
  if (error) {
    if (error.code === "KP409" || error.message.startsWith("local_deja_detenu")) {
      return NextResponse.json({ error: "Vous détenez déjà un local.", code: "local_deja_detenu" }, { status: 409 });
    }
    if (error.code === "KP422") {
      const code = error.message.startsWith("apport_insuffisant") ? "apport_insuffisant" : "endettement_excessif";
      return NextResponse.json(
        { error: "Votre situation a changé pendant la demande : apport ou plafond d'endettement non respecté.", code },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    id: idLocal,
    apportCentimes: decision.apport,
    pretCentimes: decision.montantPret,
    tauxAnnuel: decision.tauxAnnuel,
  });
}
