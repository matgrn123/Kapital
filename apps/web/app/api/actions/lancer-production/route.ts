import { NextResponse } from "next/server";
import { chargerParametresV1 } from "@kapital/content";
import {
  besoinMatiere,
  centimes,
  idMatiere,
  livraisonApresHeures,
  parametreObligatoire,
  verifierQuantiteCommande,
} from "@kapital/engine";
import { chargerContexte, estErreurAction, refuserSiVerrouille } from "../../../../lib/api-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  const body = (await request.json()) as {
    productId?: string;
    quantite?: number;
    lieuType?: "atelier" | "faconnier";
    faconnierId?: string;
  };
  if (!body.productId || !body.lieuType) {
    return NextResponse.json(
      { error: "productId et lieuType requis." },
      { status: 400 },
    );
  }
  const quantite = body.quantite ?? 0;
  if (!Number.isInteger(quantite) || quantite <= 0) {
    return NextResponse.json({ error: "Quantité invalide.", code: "quantite_invalide" }, { status: 400 });
  }

  if (body.lieuType === "atelier") {
    const verrou = refuserSiVerrouille(ctx, "production_atelier");
    if (verrou) return verrou;
    // 3D-7 : au moins un local (la société peut en avoir plusieurs).
    const { data: locaux } = await ctx.supabaseAdmin
      .from("workshops")
      .select("id")
      .eq("company_id", ctx.companyId)
      .limit(1);
    if (!locaux || locaux.length === 0) {
      return NextResponse.json(
        { error: "Votre entreprise n'a pas d'atelier propre." },
        { status: 400 },
      );
    }
    // L'atelier produit en continu selon sa capacité (cahier des charges 6.1 : capacité
    // mensuelle × Δ / durée du mois). Un ordre « atelier » daté n'était jamais lu par le
    // moteur : la demande fixe donc l'objectif de production mensuelle du produit.
    const { data: ligne, error } = await ctx.supabaseAdmin
      .from("company_products")
      .update({ production_mensuelle_cible: quantite })
      .eq("company_id", ctx.companyId)
      .eq("product_id", body.productId)
      .select("product_id")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!ligne) {
      return NextResponse.json(
        { error: "Ce produit n'est pas dans votre catalogue." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  // Façonnier
  if (!body.faconnierId) {
    return NextResponse.json({ error: "faconnierId requis." }, { status: 400 });
  }
  const [facR, catR] = await Promise.all([
    ctx.supabaseAdmin
      .from("faconniers")
      .select("id, delai_heures, minimum_commande, fournit_matiere")
      .eq("id", body.faconnierId)
      .maybeSingle(),
    ctx.supabaseAdmin
      .from("faconnier_catalogue")
      .select("prix_par_piece_centimes")
      .eq("faconnier_id", body.faconnierId)
      .eq("product_id", body.productId)
      .maybeSingle(),
  ]);
  const fac = facR.data as
    | { id: string; delai_heures: number; minimum_commande: number; fournit_matiere: boolean }
    | null;
  const catalogue = catR.data as { prix_par_piece_centimes: number } | null;
  const params = chargerParametresV1();
  if (!fac) {
    return NextResponse.json({ error: "Façonnier inconnu." }, { status: 404 });
  }
  if (!catalogue) {
    return NextResponse.json(
      { error: "Ce façonnier ne fait pas ce produit." },
      { status: 404 },
    );
  }
  // Quantité entière, minimum du façonnier, et une facture que la trésorerie peut payer.
  const verif = verifierQuantiteCommande({
    quantite,
    minimum: fac.minimum_commande,
    prixUnitaire: catalogue.prix_par_piece_centimes,
    tresorerie: ctx.companyTresorerie,
  });
  if (!verif.ok) {
    const message = verif.code === "sous_minimum" ? `Minimum du façonnier : ${fac.minimum_commande}.` : verif.message;
    return NextResponse.json({ error: message, code: verif.code }, { status: 400 });
  }

  // Le façonnier travaille la matière du joueur : elle doit être en stock à la commande
  // (elle sortira du stock 31 à la livraison, chute comprise).
  if (!fac.fournit_matiere) {
    const { data: produit } = await ctx.supabaseAdmin
      .from("products")
      .select("matiere_id, consommation_par_piece, fournitures_par_piece_centimes, temps_standard_minutes")
      .eq("id", body.productId)
      .maybeSingle();
    if (!produit) {
      return NextResponse.json({ error: "Produit inconnu." }, { status: 404 });
    }
    const { data: stock } = await ctx.supabaseAdmin
      .from("material_stock")
      .select("quantite")
      .eq("company_id", ctx.companyId)
      .eq("material_id", produit.matiere_id)
      .maybeSingle();
    const besoin = besoinMatiere(
      quantite,
      {
        matiere: idMatiere(produit.matiere_id as string),
        consommationParPiece: Number(produit.consommation_par_piece),
        fournituresParPiece: centimes(Number(produit.fournitures_par_piece_centimes)),
        tempsStandardMinutes: Number(produit.temps_standard_minutes),
      },
      parametreObligatoire(params, "taux_chute_matiere_defaut"),
    );
    const disponible = Number(stock?.quantite ?? 0);
    if (disponible < besoin) {
      return NextResponse.json(
        {
          error: `Matière insuffisante : il faut ${besoin} unités de ${produit.matiere_id as string} (chute comprise), vous en avez ${disponible}.`,
        },
        { status: 400 },
      );
    }
  }

  // Délai en heures réelles (faconniers.delai_heures) : le moteur calcule l'instant et le mois
  // de livraison en heure du jeu ; la base garde l'instant réel (heure du jeu + debut_reel).
  const maintenant = new Date();
  const ordre = livraisonApresHeures(maintenant.getTime() - ctx.debutReelMs, Number(fac.delai_heures));
  const livraison = new Date(ctx.debutReelMs + ordre.instantLivraisonMs);
  const { error } = await ctx.supabaseAdmin.from("production_orders").insert({
    company_id: ctx.companyId,
    product_id: body.productId,
    quantite,
    lieu_type: "faconnier",
    faconnier_id: body.faconnierId,
    prix_facon_par_piece_centimes: catalogue.prix_par_piece_centimes,
    instant_commande: maintenant.toISOString(),
    instant_livraison_prevue: livraison.toISOString(),
    mois_jeu_commande: ctx.moisCourant,
    mois_jeu_livraison: ordre.moisLivraison,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
