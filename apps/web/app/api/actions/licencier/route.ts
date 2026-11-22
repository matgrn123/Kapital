import { NextResponse } from "next/server";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  const body = (await request.json()) as { employeeId?: string };
  if (!body.employeeId) {
    return NextResponse.json({ error: "employeeId requis." }, { status: 400 });
  }

  // Vérifie que l'employé appartient à l'entreprise du user
  const { data: emp } = await ctx.supabaseAdmin
    .from("employees")
    .select("id, company_id")
    .eq("id", body.employeeId)
    .maybeSingle();
  if (!emp || emp.company_id !== ctx.companyId) {
    return NextResponse.json({ error: "Salarié introuvable." }, { status: 404 });
  }

  const { error } = await ctx.supabaseAdmin
    .from("employees")
    .update({ statut: "licencie" })
    .eq("id", body.employeeId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
