import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerParametresV1 } from "@kapital/content";
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

/** Met tout le monde à jour à l'instant présent (horloge du serveur, jamais celle du navigateur). */
export function avancerMondeMaintenant(supabase: SupabaseClient): Promise<ResultatAvanceMonde> {
  return avancerMondeJusquA(new StockageSupabase(supabase), chargerParametresV1(), Date.now());
}
