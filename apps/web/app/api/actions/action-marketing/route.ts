import { NextResponse } from "next/server";
import { chargerParametresV1 } from "@kapital/content";
import { aleaMarketing, coefficientsMarketingDepuisParametres, verifierActionMarketing } from "@kapital/engine";
import { COMPTE_MARKETING, estActionMarketing, marqueApresAction } from "../../../../lib/marketing";
import {
  chargerContexte,
  ecrireEcritures,
  estErreurAction,
  refuserSiVerrouille,
} from "../../../../lib/api-helpers";

export const runtime = "nodejs";

/** Préfixe des écritures marketing : sert aussi à compter les actions du mois (rang de l'aléa). */
const PREFIXE_ECRITURE = "marketing_";

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;
  const verrou = refuserSiVerrouille(ctx, "action_marketing");
  if (verrou) return verrou;

  const body = (await request.json()) as {
    type?: string;
    montantCentimes?: number;
  };
  const type = body.type ?? "";
  const montant = body.montantCentimes ?? 0;
  if (!estActionMarketing(type)) {
    return NextResponse.json({ error: "Type d'action inconnu." }, { status: 400 });
  }
  if (!Number.isInteger(montant) || montant <= 0) {
    return NextResponse.json({ error: "Montant invalide." }, { status: 400 });
  }
  const params = chargerParametresV1();
  const coefficients = coefficientsMarketingDepuisParametres(params);
  // Règles de l'action, calculées par le moteur (les mêmes que l'aperçu et la validation serveur) :
  // montant minimum (400), étape de l'affichage dans le métro (403, comme les autres verrous).
  const regles = verifierActionMarketing({ action: type, montant, etape: ctx.companyEtape, coefficients });
  if (!regles.ok) {
    return NextResponse.json(
      { error: regles.message, code: regles.code },
      { status: regles.code === "etape_insuffisante" ? 403 : 400 },
    );
  }
  if (montant > ctx.companyTresorerie) {
    return NextResponse.json(
      {
        error: `Trésorerie insuffisante (manque ${((montant - ctx.companyTresorerie) / 100).toFixed(2)} €).`,
      },
      { status: 400 },
    );
  }

  // Aléa (influenceurs) : graine déterministe société + mois de jeu + rang de l'action dans le mois.
  // Le rang est le nombre d'actions marketing déjà passées au grand livre ce mois-ci.
  let alea = 1;
  if (coefficients.actions[type].amplitudeAlea > 0) {
    const { count, error: errRang } = await ctx.supabaseAdmin
      .from("ledger_entries")
      .select("ecriture_id", { count: "exact", head: true })
      .eq("company_id", ctx.companyId)
      .eq("mois_jeu", ctx.moisCourant)
      .eq("compte", COMPTE_MARKETING)
      .eq("sens", "debit")
      .like("ecriture_id", `${PREFIXE_ECRITURE}%`);
    if (errRang) {
      return NextResponse.json({ error: errRang.message }, { status: 500 });
    }
    alea = aleaMarketing(type, coefficients, { societe: ctx.companyId, mois: ctx.moisCourant, rang: count ?? 0 });
  }

  // Marque actuelle
  const { data: marque } = await ctx.supabaseAdmin
    .from("brand_state")
    .select("notoriete, desirabilite")
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  const noto0 = (marque?.notoriete as number | undefined) ?? 0;
  const desi0 = (marque?.desirabilite as number | undefined) ?? 0;

  // Effet calculé par le moteur (table des coefficients marketing_* des paramètres).
  const { notoriete: nouvelleNoto, desirabilite: nouvelleDesi } = marqueApresAction(
    { notoriete: noto0, desirabilite: desi0 },
    type,
    montant,
    params,
    alea,
  );

  // Insertion de l'action (l'aléa n'est enregistré que pour les actions qui en ont un : migration 0042).
  const { error: errAction } = await ctx.supabaseAdmin.from("marketing_actions").insert({
    company_id: ctx.companyId,
    type,
    montant_centimes: montant,
    ...(coefficients.actions[type].amplitudeAlea > 0 ? { alea } : {}),
  });
  if (errAction) {
    return NextResponse.json({ error: errAction.message }, { status: 500 });
  }

  // Mise à jour de la marque
  const { error: errBrand } = await ctx.supabaseAdmin
    .from("brand_state")
    .upsert(
      {
        company_id: ctx.companyId,
        notoriete: nouvelleNoto,
        desirabilite: nouvelleDesi,
      },
      { onConflict: "company_id" },
    );
  if (errBrand) {
    return NextResponse.json({ error: errBrand.message }, { status: 500 });
  }

  // Écriture comptable : 623 (publicité, relations publiques) débit, 512 (banque) crédit,
  // pour le montant total (honoraires d'agence compris).
  try {
    await ecrireEcritures(ctx.supabaseAdmin, {
      companyId: ctx.companyId,
      ecritureId: `${PREFIXE_ECRITURE}${Date.now()}`,
      moisJeu: ctx.moisCourant,
      libelle: `Marketing : ${type}`,
      lignes: [
        { compte: COMPTE_MARKETING, sens: "debit", montant_centimes: montant },
        { compte: "512", sens: "credit", montant_centimes: montant },
      ],
    });
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : "Erreur écriture.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    alea,
    notoriete: nouvelleNoto - noto0,
    desirabilite: nouvelleDesi - desi0,
  });
}
