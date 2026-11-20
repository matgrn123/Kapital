import type { SupabaseClient } from "@supabase/supabase-js";
import type { Parametres } from "@kapital/content";

export type ValeurDonnee = {
  readonly donnee: string;
  readonly valeur: unknown;
  readonly source: string;
  readonly dateEffet: string;
};

export async function lireDerniereValeur(
  client: SupabaseClient,
  donnee: string,
  asOf: string,
): Promise<ValeurDonnee | null> {
  const { data, error } = await client
    .from("market_data")
    .select("donnee, valeur, source, date_effet")
    .eq("donnee", donnee)
    .lte("date_effet", asOf)
    .order("date_effet", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Lecture market_data : ${error.message}`);
  if (!data) return null;
  return {
    donnee: data.donnee as string,
    valeur: data.valeur,
    source: data.source as string,
    dateEffet: data.date_effet as string,
  };
}

export async function lireValeurAvecFallback(
  client: SupabaseClient,
  params: Parametres,
  donnee: string,
  asOf: string,
): Promise<ValeurDonnee | null> {
  const db = await lireDerniereValeur(client, donnee, asOf);
  if (db) return db;
  const defaut = params[donnee];
  if (!defaut) return null;
  return {
    donnee,
    valeur: defaut.valeur,
    source: defaut.source,
    dateEffet: defaut.date,
  };
}
