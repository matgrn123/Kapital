import { NextResponse } from "next/server";
import { chargerParametresV1 } from "@kapital/content";
import {
  ecritureLicenciement,
  evaluerLicenciement,
  idSalarie,
  moisJeu,
  parametresLicenciementDepuis,
} from "@kapital/engine";
import { validerDecision } from "@kapital/server";
import {
  chargerContexte,
  chargerEntreprisePersonnel,
  estErreurAction,
} from "../../../../lib/api-helpers";

export const runtime = "nodejs";

// AE-7 : la décision passe par validerDecision (salarié connu, indemnité légale couverte par la
// trésorerie). L'indemnité (641 / 512) et le départ du salarié sont enregistrés ensemble par la
// fonction SQL licencier_salarie, dans une seule transaction.

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  const body = (await request.json()) as { employeeId?: string };
  if (!body.employeeId) {
    return NextResponse.json({ error: "employeeId requis." }, { status: 400 });
  }

  // Les salariés chargés sont ceux de l'entreprise du joueur : un identifiant étranger est inconnu.
  const entreprise = await chargerEntreprisePersonnel(ctx);
  const decision = validerDecision(
    { entreprise },
    { type: "licenciement", salarie: idSalarie(body.employeeId) },
  );
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.message, code: decision.code },
      { status: decision.code === "salarie_inconnu" ? 404 : 400 },
    );
  }
  const salarie = entreprise.salaries.find((s) => s.id === body.employeeId)!;
  const evaluation = evaluerLicenciement(
    salarie,
    entreprise.tresorerie,
    parametresLicenciementDepuis(chargerParametresV1()),
  );
  const indemnite = evaluation.indemnite;
  const ecriture = ecritureLicenciement(ctx.companyId, moisJeu(ctx.moisCourant), salarie.id, indemnite);

  const { error } = await ctx.supabaseAdmin.rpc("licencier_salarie", {
    p_company_id: ctx.companyId,
    p_employee_id: body.employeeId,
    p_indemnite_centimes: indemnite,
    p_mois_jeu: ctx.moisCourant,
    p_ecriture_id: ecriture?.id ?? null,
  });
  if (error) {
    if (error.code === "KP404") {
      return NextResponse.json({ error: "Salarié introuvable ou déjà parti.", code: "salarie_inconnu" }, { status: 404 });
    }
    if (error.code === "KP422") {
      return NextResponse.json(
        { error: "Votre trésorerie ne couvre plus l'indemnité de licenciement.", code: "tresorerie_insuffisante" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, indemniteCentimes: indemnite });
}
