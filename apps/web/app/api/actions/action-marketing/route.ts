import { NextResponse } from "next/server";
import { chargerParametresV1 } from "@kapital/content";
import { COMPTE_MARKETING, estActionMarketing, marqueApresAction } from "../../../../lib/marketing";
import {
  chargerContexte,
  ecrireEcritures,
  estErreurAction,
  refuserSiVerrouille,
} from "../../../../lib/api-helpers";

export const runtime = "nodejs";

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
  if (montant > ctx.companyTresorerie) {
    return NextResponse.json(
      {
        error: `Trésorerie insuffisante (manque ${((montant - ctx.companyTresorerie) / 100).toFixed(2)} €).`,
      },
      { status: 400 },
    );
  }

  // Marque actuelle
  const { data: marque } = await ctx.supabaseAdmin
    .from("brand_state")
    .select("notoriete, desirabilite")
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  const noto0 = (marque?.notoriete as number | undefined) ?? 0;
  const desi0 = (marque?.desirabilite as number | undefined) ?? 0;

  // Effet calculé par le moteur (coefficients marketing_k_* des paramètres).
  const { notoriete: nouvelleNoto, desirabilite: nouvelleDesi } = marqueApresAction(
    { notoriete: noto0, desirabilite: desi0 },
    type,
    montant,
    chargerParametresV1(),
  );

  // Insertion de l'action
  const { error: errAction } = await ctx.supabaseAdmin.from("marketing_actions").insert({
    company_id: ctx.companyId,
    type,
    montant_centimes: montant,
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

  // Écriture comptable : 623 (publicité, relations publiques) débit, 512 (banque) crédit
  try {
    await ecrireEcritures(ctx.supabaseAdmin, {
      companyId: ctx.companyId,
      ecritureId: `marketing_${Date.now()}`,
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

  return NextResponse.json({ ok: true });
}
