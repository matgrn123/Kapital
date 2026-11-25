import type { SupabaseClient } from "@supabase/supabase-js";
import { dateDeJeuDepuisInstant } from "../../../lib/cadre";

/**
 * Naissance du monde actif (worlds.debut_reel) : le point de départ de l'horloge commune.
 * Toutes les dates de jeu se calculent à partir d'elle. Null si le monde n'a pas encore démarré.
 */
export async function lireDebutMonde(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from("worlds").select("debut_reel").eq("etat", "actif").limit(1).maybeSingle();
  return ((data as { debut_reel?: string | null } | null)?.debut_reel ?? null) || null;
}

/**
 * Formateur de dates de jeu pour un écran serveur : « 12 mars, an 1 (dans 48 min) ».
 * L'instant présent est lu une fois, au rendu de la page, sur l'horloge du serveur.
 */
export async function formateurDateDeJeu(supabase: SupabaseClient): Promise<(instant: string | number) => string> {
  const debut = await lireDebutMonde(supabase);
  const maintenant = Date.now();
  return (instant) => dateDeJeuDepuisInstant(instant, debut, maintenant);
}
