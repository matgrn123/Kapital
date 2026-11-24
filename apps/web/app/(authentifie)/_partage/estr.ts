import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * €STR annuel du mois : dernière valeur connue de market_data ; à défaut, la valeur de secours
 * des paramètres (même règle que les routes demander-pret et acheter-local).
 */
export async function lireEstrAnnuel(supabase: SupabaseClient, secours: number): Promise<number> {
  const { data } = await supabase
    .from("market_data")
    .select("valeur")
    .eq("donnee", "estr_annuel")
    .lte("date_effet", new Date().toISOString().slice(0, 10))
    .order("date_effet", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lu = Number((data as { valeur?: unknown } | null)?.valeur);
  return Number.isFinite(lu) ? lu : secours;
}
