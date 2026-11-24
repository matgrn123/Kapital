import { NextResponse } from "next/server";
import {
  chargerContexte,
  ecrireEcritures,
  estErreurAction,
  refuserSiVerrouille,
} from "../../../../lib/api-helpers";

export const runtime = "nodejs";

const HEURES_PAR_MOIS_JEU = 24;
const TAUX_ANNUEL = 0.055;

function mensualite(capital: number, tauxAnnuel: number, dureeMois: number): number {
  if (tauxAnnuel === 0) return Math.round(capital / dureeMois);
  const i = tauxAnnuel / 12;
  return Math.round((capital * i) / (1 - Math.pow(1 + i, -dureeMois)));
}

function genererEcheancier(capital: number, tauxAnnuel: number, dureeMois: number) {
  const mens = mensualite(capital, tauxAnnuel, dureeMois);
  const i = tauxAnnuel / 12;
  const result: Array<{
    numero: number;
    mensualite: number;
    interets: number;
    amortissement: number;
    capitalRestantApres: number;
  }> = [];
  let restant = capital;
  for (let k = 1; k < dureeMois; k++) {
    const interets = Math.round(restant * i);
    const amort = mens - interets;
    restant -= amort;
    result.push({ numero: k, mensualite: mens, interets, amortissement: amort, capitalRestantApres: restant });
  }
  const interetsFinal = Math.round(restant * i);
  result.push({
    numero: dureeMois,
    mensualite: restant + interetsFinal,
    interets: interetsFinal,
    amortissement: restant,
    capitalRestantApres: 0,
  });
  return result;
}

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;
  const verrou = refuserSiVerrouille(ctx, "demande_pret");
  if (verrou) return verrou;

  const body = (await request.json()) as {
    capitalCentimes?: number;
    dureeMois?: number;
  };
  const capital = body.capitalCentimes ?? 0;
  const duree = body.dureeMois ?? 0;
  if (!Number.isFinite(capital) || capital <= 0) {
    return NextResponse.json({ error: "Capital invalide." }, { status: 400 });
  }
  if (!Number.isFinite(duree) || duree < 12 || duree > 240) {
    return NextResponse.json({ error: "Durée entre 12 et 240 mois." }, { status: 400 });
  }

  // Dette actuelle (somme des capital_restant_centimes des prêts actifs)
  const { data: prets } = await ctx.supabaseAdmin
    .from("loans")
    .select("capital_restant_centimes")
    .eq("company_id", ctx.companyId);
  const detteActuelle = ((prets ?? []) as Array<{ capital_restant_centimes: number }>)
    .reduce((s, p) => s + p.capital_restant_centimes, 0);
  const plafond = Math.max(ctx.companyTresorerie, 1) * 5;
  if (detteActuelle + capital > plafond) {
    return NextResponse.json(
      {
        error: `Dette totale (${((detteActuelle + capital) / 100).toFixed(2)} €) dépasse 5× votre trésorerie actuelle.`,
      },
      { status: 400 },
    );
  }

  const maintenant = new Date();
  const { data: pret, error: errPret } = await ctx.supabaseAdmin
    .from("loans")
    .insert({
      company_id: ctx.companyId,
      capital_initial_centimes: capital,
      capital_restant_centimes: capital,
      taux_annuel: TAUX_ANNUEL,
      duree_mois: duree,
      instant_debut: maintenant.toISOString(),
      mois_jeu_debut: ctx.moisCourant,
    })
    .select("id")
    .single();
  if (errPret || !pret) {
    return NextResponse.json(
      { error: errPret?.message ?? "Erreur création prêt." },
      { status: 500 },
    );
  }

  const echeancier = genererEcheancier(capital, TAUX_ANNUEL, duree);
  const lignes = echeancier.map((ech) => ({
    loan_id: pret.id,
    numero: ech.numero,
    mensualite_centimes: ech.mensualite,
    interets_centimes: ech.interets,
    amortissement_centimes: ech.amortissement,
    capital_restant_apres_centimes: ech.capitalRestantApres,
    instant_prevu: new Date(
      maintenant.getTime() + ech.numero * HEURES_PAR_MOIS_JEU * 3600 * 1000,
    ).toISOString(),
  }));
  const { error: errSched } = await ctx.supabaseAdmin
    .from("loan_schedules")
    .insert(lignes);
  if (errSched) {
    return NextResponse.json({ error: errSched.message }, { status: 500 });
  }

  // Écriture comptable : 512 débit (banque), 164 crédit (emprunts)
  try {
    await ecrireEcritures(ctx.supabaseAdmin, {
      companyId: ctx.companyId,
      ecritureId: `pret_${pret.id}`,
      moisJeu: ctx.moisCourant,
      libelle: `Mise à disposition du prêt`,
      lignes: [
        { compte: "512", sens: "debit", montant_centimes: capital },
        { compte: "164", sens: "credit", montant_centimes: capital },
      ],
    });
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : "Erreur écriture.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
