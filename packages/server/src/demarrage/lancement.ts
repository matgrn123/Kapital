import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerParametresV1 } from "@kapital/content";
import {
  centimes,
  commanderAuGrossiste,
  coutRevientEstime,
  idProduit,
  moisJeu,
  preparerSerieLancement,
  verifierQuantiteCommande,
} from "@kapital/engine";

// TP-3 : démarrage sans attente. Série de lancement à la création, grossiste local
// qui livre le jour même. Tout le calcul est dans packages/engine/src/demarrage ;
// ici, seulement la lecture du catalogue et l'écriture en base.

export const ID_GROSSISTE_LOCAL = "gros_local";

/** Coût de revient d'une pièce à l'usine (médiane des prix de la matière au catalogue). */
export async function coutUsineParPiece(
  supabase: SupabaseClient,
  productId: string,
): Promise<number> {
  const params = chargerParametresV1();
  const [produitR, cataloguesR] = await Promise.all([
    supabase
      .from("products")
      .select("id, matiere_id, consommation_par_piece, fournitures_par_piece_centimes")
      .eq("id", productId)
      .maybeSingle(),
    supabase.from("supplier_catalogue").select("material_id, prix_centimes"),
  ]);
  if (produitR.error) throw new Error(produitR.error.message);
  if (!produitR.data) throw new Error(`Produit inconnu : ${productId}`);
  if (cataloguesR.error) throw new Error(cataloguesR.error.message);

  const produit = produitR.data as {
    matiere_id: string;
    consommation_par_piece: number;
    fournitures_par_piece_centimes: number;
  };
  const prix = ((cataloguesR.data ?? []) as Array<{ material_id: string; prix_centimes: number }>)
    .filter((c) => c.material_id === produit.matiere_id)
    .map((c) => c.prix_centimes)
    .sort((a, b) => a - b);
  const prixMatiere = prix[Math.floor(prix.length / 2)] ?? 0;

  return coutRevientEstime(
    {
      consommationParPiece: produit.consommation_par_piece,
      fournituresParPieceCentimes: produit.fournitures_par_piece_centimes,
      prixMatiereParUniteCentimes: prixMatiere,
    },
    params,
  );
}

export type ResultatSerieLancement = {
  /** Faux si la série de ce produit avait déjà été faite. */
  readonly appliquee: boolean;
  readonly quantite: number;
  readonly valeurTotaleCentimes: number;
};

export async function lancerSerieDeLancement(
  supabase: SupabaseClient,
  p: { companyId: string; productId: string; moisCourant: number },
): Promise<ResultatSerieLancement> {
  const params = chargerParametresV1();
  const cout = await coutUsineParPiece(supabase, p.productId);
  const serie = preparerSerieLancement({
    params,
    produit: idProduit(p.productId),
    coutUnitaire: centimes(cout),
    mois: moisJeu(p.moisCourant),
  });
  const { data, error } = await supabase.rpc("appliquer_serie_lancement", {
    p_company_id: p.companyId,
    p_product_id: p.productId,
    p_quantite: serie.quantite,
    p_cout_unitaire_centimes: cout,
    p_mois_jeu: p.moisCourant,
  });
  if (error) throw new Error(error.message);
  return {
    appliquee: data === true,
    quantite: serie.quantite,
    valeurTotaleCentimes: serie.valeurTotale,
  };
}

export type ResultatCommandeGrossiste = {
  readonly quantite: number;
  readonly prixParPieceCentimes: number;
  readonly totalCentimes: number;
  readonly livraisonPrevue: string;
};

/** Commande refusée par une règle du jeu (à renvoyer en 400, pas en 500). */
export class CommandeRefusee extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommandeRefusee";
  }
}

export async function passerCommandeGrossiste(
  supabase: SupabaseClient,
  p: {
    companyId: string;
    productId: string;
    quantite: number;
    moisCourant: number;
    maintenant: Date;
    /** Trésorerie du moment : la commande ne peut pas coûter plus (décision du 25/11/2026). */
    tresorerieCentimes: number;
  },
): Promise<ResultatCommandeGrossiste> {
  const params = chargerParametresV1();
  const cout = await coutUsineParPiece(supabase, p.productId);
  const c = commanderAuGrossiste({
    params,
    produit: idProduit(p.productId),
    quantite: p.quantite,
    coutUsineParPiece: centimes(cout),
    instantCommandeMs: p.maintenant.getTime(),
  });
  const verif = verifierQuantiteCommande({
    quantite: c.quantite,
    minimum: 1,
    prixUnitaire: c.prixParPiece,
    tresorerie: p.tresorerieCentimes,
  });
  if (!verif.ok) throw new CommandeRefusee(verif.code, verif.message);
  const livraison = new Date(c.instantLivraisonMs).toISOString();
  // Une commande au grossiste est un ordre « façonnier » sans matière : la livraison au pas
  // (TP-2) range les pièces au stock et inscrit la dette fournisseur (35 / 401).
  const { error } = await supabase.from("production_orders").insert({
    company_id: p.companyId,
    product_id: p.productId,
    quantite: c.quantite,
    lieu_type: "faconnier",
    faconnier_id: ID_GROSSISTE_LOCAL,
    prix_facon_par_piece_centimes: c.prixParPiece,
    instant_commande: p.maintenant.toISOString(),
    instant_livraison_prevue: livraison,
    mois_jeu_commande: p.moisCourant,
    mois_jeu_livraison: p.moisCourant,
  });
  if (error) throw new Error(error.message);
  return {
    quantite: c.quantite,
    prixParPieceCentimes: c.prixParPiece,
    totalCentimes: c.total,
    livraisonPrevue: livraison,
  };
}
