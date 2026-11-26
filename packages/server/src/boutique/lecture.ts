import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerBatimentsV1 } from "@kapital/content";
import type { PointDeVente } from "@kapital/engine";
import {
  pointsDeVenteDepuisLignes,
  SELECTION_POINTS_DE_VENTE,
  type LignePointDeVente,
} from "../avance/stockageSupabase.js";

// AE-10 : lecture des boutiques d'une société (routes, écran Magasin, village). Même
// conversion que le moteur (pointsDeVenteDepuisLignes) : un seul endroit sait lire la table.

/** T3 : « * » lit aussi ouverture_le (migration 0045) quand la colonne existe. */
export const COLONNES_POINTS_DE_VENTE = SELECTION_POINTS_DE_VENTE;

/**
 * Boutiques actives de la société, avec leur stock et leurs amortissements déjà passés.
 * Rend [] tant que la migration 0038 n'est pas appliquée (table absente).
 */
export async function chargerPointsDeVenteSupabase(
  supabase: SupabaseClient,
  companyId: string,
): Promise<PointDeVente[]> {
  const r = await supabase
    .from("points_de_vente")
    .select(COLONNES_POINTS_DE_VENTE)
    .eq("company_id", companyId)
    .eq("statut", "actif")
    .order("cree_le");
  if (r.error) {
    if (r.error.code === "42P01" || r.error.code === "PGRST205" || /points_de_vente/.test(r.error.message)) return [];
    throw new Error(`points_de_vente : ${r.error.message}`);
  }
  const lignes = (r.data ?? []) as unknown as LignePointDeVente[];
  if (lignes.length === 0) return [];
  const a = await supabase
    .from("ledger_entries")
    .select("ecriture_id, sens, montant_centimes")
    .eq("company_id", companyId)
    .eq("compte", "28135");
  if (a.error) throw new Error(`ledger 28135 : ${a.error.message}`);
  return pointsDeVenteDepuisLignes(
    lignes,
    (a.data ?? []) as Array<{ ecriture_id: string; sens: string; montant_centimes: number }>,
    chargerBatimentsV1(),
  );
}
