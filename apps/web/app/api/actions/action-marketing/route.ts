import { NextResponse } from "next/server";
import {
  chargerContexte,
  ecrireEcritures,
  estErreurAction,
  refuserSiVerrouille,
} from "../../../../lib/api-helpers";

export const runtime = "nodejs";

const K: Record<string, { n: number; d: number }> = {
  publicite: { n: 2.0, d: 0 },
  image_marque: { n: 0, d: 2.0 },
  promotion: { n: 1.0, d: -1.5 },
  relations_presse: { n: 1.5, d: 1.5 },
};

function clamp(x: number): number {
  return Math.max(0, Math.min(100, x));
}

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
  if (!K[type]) {
    return NextResponse.json({ error: "Type d'action inconnu." }, { status: 400 });
  }
  if (!Number.isFinite(montant) || montant <= 0) {
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

  const montantEuros = montant / 100;
  const m = Math.log(1 + montantEuros);
  const k = K[type]!;
  const nouvelleNoto = clamp(noto0 + k.n * m);
  const nouvelleDesi = clamp(desi0 + k.d * m);

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

  // Écriture comptable : 6228 (charges externes) débit, 512 (banque) crédit
  try {
    await ecrireEcritures(ctx.supabaseAdmin, {
      companyId: ctx.companyId,
      ecritureId: `marketing_${Date.now()}`,
      moisJeu: ctx.moisCourant,
      libelle: `Marketing : ${type}`,
      lignes: [
        { compte: "6228", sens: "debit", montant_centimes: montant },
        { compte: "512", sens: "credit", montant_centimes: montant },
      ],
    });
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : "Erreur écriture.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
