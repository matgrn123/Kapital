import { NextResponse } from "next/server";
import { chargerParametresV1 } from "@kapital/content";
import {
  centimes,
  estObjetPret,
  evaluerDemandePret,
  genererEcheancier,
  capaciteEmprunt,
  tauxPret,
  type ObjetPret,
} from "@kapital/engine";
import { reglesPretV1 } from "@kapital/server";
import {
  chargerContexte,
  estErreurAction,
  refuserSiVerrouille,
} from "../../../../lib/api-helpers";

export const runtime = "nodejs";

// AE-4 : la route ne recalcule plus rien elle-même. Les plafonds, durées et marges sont
// dans les paramètres (reglesPretV1), la décision est évaluée par le moteur, l'échéancier
// vient de genererEcheancier, et le prêt, son échéancier et l'écriture 512/164 sont
// enregistrés ensemble par la fonction SQL creer_pret (une seule transaction).

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;
  const verrou = refuserSiVerrouille(ctx, "demande_pret");
  if (verrou) return verrou;

  const body = (await request.json()) as {
    capitalCentimes?: number;
    dureeMois?: number;
    objet?: string;
  };
  const capital = body.capitalCentimes ?? 0;
  const duree = body.dureeMois ?? 0;
  // Sans objet (page actuelle de la banque), la demande est un prêt de trésorerie.
  const objetBrut = body.objet ?? "tresorerie";
  if (!estObjetPret(objetBrut)) {
    return NextResponse.json(
      { error: "Objet du prêt inconnu (trésorerie, équipement ou immobilier).", code: "objet_invalide" },
      { status: 400 },
    );
  }
  const objet: ObjetPret = objetBrut;
  if (!Number.isInteger(capital) || capital <= 0) {
    return NextResponse.json({ error: "Capital invalide.", code: "montant_invalide" }, { status: 400 });
  }
  if (!Number.isInteger(duree) || duree <= 0) {
    return NextResponse.json({ error: "Durée invalide.", code: "duree_hors_bornes" }, { status: 400 });
  }

  const { data: prets } = await ctx.supabaseAdmin
    .from("loans")
    .select("capital_restant_centimes")
    .eq("company_id", ctx.companyId)
    .eq("statut", "actif");
  const detteEnCours = ((prets ?? []) as Array<{ capital_restant_centimes: number }>)
    .reduce((s, p) => s + Number(p.capital_restant_centimes), 0);

  const regles = reglesPretV1();
  const situation = { tresorerie: centimes(ctx.companyTresorerie), detteEnCours: centimes(detteEnCours) };
  const evaluation = evaluerDemandePret(
    situation,
    { objet, montant: centimes(capital), dureeMois: duree },
    regles,
  );
  if (!evaluation.ok) {
    return NextResponse.json(
      { error: evaluation.message, code: evaluation.code, depassement: evaluation.depassement },
      { status: 400 },
    );
  }
  const plafondEndettement = capaciteEmprunt(situation, objet, regles).plafondEndettement;

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
  // Taux = €STR + marge de l'objet + prime de risque (endettement après prêt, découvert).
  const taux = tauxPret(objet, estr, regles, {
    tresorerie: centimes(ctx.companyTresorerie),
    detteApresPret: centimes(detteEnCours + capital),
    moisDecouvertConsecutifs: ctx.companyMoisDecouvert,
  });

  const echeancier = genererEcheancier(centimes(capital), taux, duree);
  const minutesParMoisJeu = chargerParametresV1()["temps_minutes_reelles_par_mois_jeu"]?.valeur;
  if (!minutesParMoisJeu || minutesParMoisJeu <= 0) {
    return NextResponse.json({ error: "Paramètre de temps manquant." }, { status: 500 });
  }
  const lignes = echeancier.map((ech) => ({
    numero: ech.numero,
    mensualite_centimes: ech.montant,
    interets_centimes: ech.interets,
    amortissement_centimes: ech.amortissement,
    capital_restant_apres_centimes: ech.capitalRestantApres,
    instant_prevu: new Date(aujourdhui.getTime() + ech.numero * minutesParMoisJeu * 60_000).toISOString(),
  }));

  const { data: idPret, error } = await ctx.supabaseAdmin.rpc("creer_pret", {
    p_company_id: ctx.companyId,
    p_objet: objet,
    p_capital_centimes: capital,
    p_taux_annuel: taux,
    p_duree_mois: duree,
    p_mois_jeu: ctx.moisCourant,
    p_instant_debut: aujourdhui.toISOString(),
    p_plafond_endettement_centimes: plafondEndettement,
    p_echeancier: lignes,
  });
  if (error) {
    // KP422 : le plafond a été atteint entre-temps par une autre demande.
    const refusConcurrent = error.message.startsWith("endettement_excessif") || error.code === "KP422";
    return NextResponse.json(
      {
        error: refusConcurrent
          ? "Votre endettement a changé pendant la demande : le plafond est atteint."
          : error.message,
        ...(refusConcurrent ? { code: "endettement_excessif" } : {}),
      },
      { status: refusConcurrent ? 400 : 500 },
    );
  }

  return NextResponse.json({ ok: true, id: idPret, tauxAnnuel: taux });
}
