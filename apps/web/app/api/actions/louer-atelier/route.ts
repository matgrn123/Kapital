import { NextResponse } from "next/server";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";

export const runtime = "nodejs";

export async function POST() {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  const { data: existing } = await ctx.supabaseAdmin
    .from("workshops")
    .select("id")
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "Vous avez déjà un atelier." },
      { status: 409 },
    );
  }

  const { error } = await ctx.supabaseAdmin.from("workshops").insert({
    company_id: ctx.companyId,
    surface_m2: 50,
    loyer_mensuel_centimes: 100_000,
    nombre_machines: 2,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
