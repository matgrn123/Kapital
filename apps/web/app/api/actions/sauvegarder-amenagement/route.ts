import { NextResponse } from "next/server";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";

export const runtime = "nodejs";

type ModulePlace = {
  module_type_id: string;
  x: number;
  y: number;
  pivote?: boolean;
};

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  const body = (await request.json()) as {
    workshopId?: string;
    modules?: unknown;
  };

  if (!body.workshopId || typeof body.workshopId !== "string") {
    return NextResponse.json({ error: "workshopId requis." }, { status: 400 });
  }
  if (!Array.isArray(body.modules)) {
    return NextResponse.json({ error: "modules doit être un tableau." }, { status: 400 });
  }

  const modules = body.modules as ModulePlace[];
  for (const m of modules) {
    if (typeof m.module_type_id !== "string" || !m.module_type_id) {
      return NextResponse.json({ error: "module_type_id manquant ou invalide." }, { status: 400 });
    }
    if (!Number.isInteger(m.x) || !Number.isInteger(m.y)) {
      return NextResponse.json({ error: "x et y doivent être des entiers." }, { status: 400 });
    }
  }

  // Vérifier que le workshop appartient bien à la company de l'utilisateur.
  const { data: workshop } = await ctx.supabaseAdmin
    .from("workshops")
    .select("id")
    .eq("id", body.workshopId)
    .eq("company_id", ctx.companyId)
    .maybeSingle();

  if (!workshop) {
    return NextResponse.json({ error: "Atelier introuvable." }, { status: 404 });
  }

  // Supprimer les modules existants puis insérer les nouveaux.
  const { error: deleteError } = await ctx.supabaseAdmin
    .from("placed_modules")
    .delete()
    .eq("workshop_id", body.workshopId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (modules.length > 0) {
    const rows = modules.map((m) => ({
      workshop_id: body.workshopId as string,
      module_type_id: m.module_type_id,
      x: m.x,
      y: m.y,
      pivote: m.pivote ?? false,
    }));

    const { error: insertError } = await ctx.supabaseAdmin
      .from("placed_modules")
      .insert(rows);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
