import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerParametresV1 } from "@kapital/content";
import { coutRevientEstime } from "@kapital/engine";

// Approvisionnement manuel du stock de produits finis — utile en recette pour
// que les joueurs puissent commencer a vendre sans monter d'atelier.
// Remplace T28 (processeur d'ordres de production reels) jusqu'a ce qu'il soit
// branche.

export type ParamsApprovisionner = {
  readonly companyId: string;
  readonly productId: string;
  readonly quantite: number;
};

export type ResultatApprovisionner = {
  readonly company_id: string;
  readonly product_id: string;
  readonly quantite_ajoutee: number;
  readonly cout_unitaire_centimes: number;
  readonly quantite_apres: number;
  readonly valeur_apres_centimes: number;
};

export async function approvisionnerStock(
  supabase: SupabaseClient,
  p: ParamsApprovisionner,
): Promise<ResultatApprovisionner> {
  if (p.quantite <= 0) {
    throw new Error("La quantité doit être strictement positive.");
  }

  const params = chargerParametresV1();

  const [produitR, cataloguesR, stockR] = await Promise.all([
    supabase
      .from("products")
      .select("id, matiere_id, consommation_par_piece, fournitures_par_piece_centimes")
      .eq("id", p.productId)
      .maybeSingle(),
    supabase.from("supplier_catalogue").select("material_id, prix_centimes"),
    supabase
      .from("product_stock")
      .select("quantite_pieces, valeur_totale_centimes")
      .eq("company_id", p.companyId)
      .eq("product_id", p.productId)
      .maybeSingle(),
  ]);

  if (produitR.error) throw new Error(produitR.error.message);
  if (!produitR.data) throw new Error(`Produit inconnu : ${p.productId}`);
  if (cataloguesR.error) throw new Error(cataloguesR.error.message);
  if (stockR.error) throw new Error(stockR.error.message);

  const produit = produitR.data as {
    matiere_id: string;
    consommation_par_piece: number;
    fournitures_par_piece_centimes: number;
  };
  const catalogues =
    (cataloguesR.data ?? []) as Array<{ material_id: string; prix_centimes: number }>;

  const prixs = catalogues
    .filter((c) => c.material_id === produit.matiere_id)
    .map((c) => c.prix_centimes)
    .sort((a, b) => a - b);
  const prixMatiere = prixs[Math.floor(prixs.length / 2)] ?? 0;

  const coutUnitaire = coutRevientEstime(
    {
      consommationParPiece: produit.consommation_par_piece,
      fournituresParPieceCentimes: produit.fournitures_par_piece_centimes,
      prixMatiereParUniteCentimes: prixMatiere,
    },
    params,
  );

  const avant = (stockR.data ?? { quantite_pieces: 0, valeur_totale_centimes: 0 }) as {
    quantite_pieces: number;
    valeur_totale_centimes: number;
  };
  const quantiteApres = avant.quantite_pieces + p.quantite;
  const valeurApres = avant.valeur_totale_centimes + coutUnitaire * p.quantite;

  const { error: errUpdate } = await supabase
    .from("product_stock")
    .upsert(
      {
        company_id: p.companyId,
        product_id: p.productId,
        quantite_pieces: quantiteApres,
        valeur_totale_centimes: valeurApres,
        mise_a_jour_le: new Date().toISOString(),
      },
      { onConflict: "company_id,product_id" },
    );
  if (errUpdate) throw new Error(errUpdate.message);

  // Contrepartie compta : debit 35 (stock), credit 512 (banque - on considere
  // que le reassort est paye immediatement pour le MVP)
  const ecritureId = `approv_${p.productId}_${Date.now()}`;
  const total = coutUnitaire * p.quantite;
  const { error: errEcr } = await supabase.from("ledger_entries").insert([
    {
      company_id: p.companyId,
      ecriture_id: ecritureId,
      mois_jeu: 0,
      libelle: `Approvisionnement manuel ${p.quantite} ${p.productId}`,
      compte: "35",
      sens: "debit",
      montant_centimes: total,
    },
    {
      company_id: p.companyId,
      ecriture_id: ecritureId,
      mois_jeu: 0,
      libelle: `Approvisionnement manuel ${p.quantite} ${p.productId}`,
      compte: "512",
      sens: "credit",
      montant_centimes: total,
    },
  ]);
  if (errEcr) throw new Error(errEcr.message);

  // Debiter la tresorerie
  const { data: compAvant } = await supabase
    .from("companies")
    .select("tresorerie_centimes")
    .eq("id", p.companyId)
    .maybeSingle();
  if (compAvant) {
    await supabase
      .from("companies")
      .update({
        tresorerie_centimes:
          (compAvant.tresorerie_centimes as number) - total,
      })
      .eq("id", p.companyId);
  }

  return {
    company_id: p.companyId,
    product_id: p.productId,
    quantite_ajoutee: p.quantite,
    cout_unitaire_centimes: coutUnitaire,
    quantite_apres: quantiteApres,
    valeur_apres_centimes: valeurApres,
  };
}
