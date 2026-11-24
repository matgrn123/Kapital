import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerParametresV1 } from "@kapital/content";
import { enregistrerPassage } from "../admin/supabaseAdmin.js";
import type { Declencheur } from "../admin/cockpit.js";
import { avancerMondeJusquA, type ResultatAvanceMonde } from "./orchestrateur.js";
import { StockageSupabase } from "./stockageSupabase.js";

export {
  avancerMondeJusquA,
  type OptionsAvance,
  type ResultatAvanceEntreprise,
  type ResultatAvanceMonde,
} from "./orchestrateur.js";
export { lireHorloge, type HorlogeDuMonde } from "./horloge.js";
export { chargeUtileDepuisLot, StockageSupabase, type ChargeUtilePas } from "./stockageSupabase.js";
export {
  ErreurPasDejaTraite,
  type ResultatLotAEnregistrer,
  type StockageMonde,
} from "./port.js";

/**
 * Met tout le monde à jour à l'instant présent (horloge du serveur, jamais celle du navigateur)
 * et garde une trace du passage dans journal_avance.
 */
export async function avancerMondeMaintenant(
  supabase: SupabaseClient,
  declencheur: Declencheur = "minuterie",
): Promise<ResultatAvanceMonde> {
  const debutMs = Date.now();
  const resultat = await avancerMondeJusquA(new StockageSupabase(supabase), chargerParametresV1(), debutMs);
  const finMs = Date.now();
  await enregistrerPassage(supabase, resultat, finMs - debutMs, declencheur, finMs);
  return resultat;
}
