import { NextResponse } from "next/server";
import { livraisonApresHeures, verifierQuantiteCommande } from "@kapital/engine";
import { chargerContexte, estErreurAction } from "../../../../lib/api-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return ctx;

  const body = (await request.json()) as {
    supplierId?: string;
    materialId?: string;
    quantite?: number;
  };
  if (!body.supplierId || !body.materialId) {
    return NextResponse.json(
      { error: "supplierId et materialId requis." },
      { status: 400 },
    );
  }
  const quantite = body.quantite ?? 0;
  if (!Number.isInteger(quantite) || quantite <= 0) {
    return NextResponse.json({ error: "Quantité invalide.", code: "quantite_invalide" }, { status: 400 });
  }

  const [fournisseurR, catR] = await Promise.all([
    ctx.supabaseAdmin
      .from("suppliers")
      .select("id, delai_heures, minimum_commande")
      .eq("id", body.supplierId)
      .maybeSingle(),
    ctx.supabaseAdmin
      .from("supplier_catalogue")
      .select("prix_centimes")
      .eq("supplier_id", body.supplierId)
      .eq("material_id", body.materialId)
      .maybeSingle(),
  ]);
  const fournisseur = fournisseurR.data as
    | { id: string; delai_heures: number; minimum_commande: number }
    | null;
  const catalogue = catR.data as { prix_centimes: number } | null;
  if (!fournisseur) {
    return NextResponse.json({ error: "Fournisseur inconnu." }, { status: 404 });
  }
  if (!catalogue) {
    return NextResponse.json(
      { error: "Cette matière n'est pas au catalogue du fournisseur." },
      { status: 404 },
    );
  }
  // Quantité entière, minimum du fournisseur, et pas plus que ce que la trésorerie peut payer.
  const verif = verifierQuantiteCommande({
    quantite,
    minimum: fournisseur.minimum_commande,
    prixUnitaire: catalogue.prix_centimes,
    tresorerie: ctx.companyTresorerie,
  });
  if (!verif.ok) {
    return NextResponse.json({ error: verif.message, code: verif.code }, { status: 400 });
  }

  // Délai en heures réelles (suppliers.delai_heures) : le moteur calcule l'instant et le mois
  // de livraison en heure du jeu ; la base garde l'instant réel (heure du jeu + debut_reel).
  const maintenant = new Date();
  const commande = livraisonApresHeures(maintenant.getTime() - ctx.debutReelMs, Number(fournisseur.delai_heures));
  const livraison = new Date(ctx.debutReelMs + commande.instantLivraisonMs);

  const { error } = await ctx.supabaseAdmin.from("purchase_orders").insert({
    company_id: ctx.companyId,
    supplier_id: body.supplierId,
    material_id: body.materialId,
    quantite,
    prix_unitaire_centimes: catalogue.prix_centimes,
    instant_commande: maintenant.toISOString(),
    instant_livraison_prevue: livraison.toISOString(),
    mois_jeu_commande: ctx.moisCourant,
    mois_jeu_livraison: commande.moisLivraison,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
