import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerParametresV1 } from "@kapital/content";
import { capitalDeDepart, creerSociete, moisJeu, type Gamme } from "@kapital/engine";

// AE-1 : création de la société. Les règles (nom, gamme, capital) sont dans
// packages/engine/src/societe ; ici, seulement l'appel à la fonction Postgres atomique.

export type ResultatCreationSociete = {
  readonly companyId: string;
  readonly capitalCentimes: number;
};

export async function creerSocieteJoueur(
  supabase: SupabaseClient,
  p: { ownerId: string; nom: string; gamme: Gamme },
): Promise<ResultatCreationSociete> {
  const params = chargerParametresV1();
  // Valide le nom et la gamme avant de toucher à la base (lève ErreurSociete).
  const societe = creerSociete({ params, nom: p.nom, gamme: p.gamme, mois: moisJeu(0) });
  const capital = capitalDeDepart(params);
  const { data, error } = await supabase.rpc("creer_societe", {
    p_owner: p.ownerId,
    p_nom: societe.nom,
    p_gamme: societe.gamme,
    p_capital_centimes: capital,
  });
  if (error) throw new Error(error.message);
  return { companyId: data as string, capitalCentimes: capital };
}
