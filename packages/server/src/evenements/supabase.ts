import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvenementJournal, ValeurJson } from "./types.js";

/** Ligne de la table `evenements` (migration 0041). */
export type LigneEvenement = {
  readonly company_id: string;
  readonly type: string;
  readonly cle: string;
  readonly mois_jeu: number;
  readonly pas: number | null;
  readonly instant: string;
  readonly titre: string;
  readonly detail: { readonly [cle: string]: ValeurJson };
};

export function lignesEvenements(companyId: string, evenements: readonly EvenementJournal[]): LigneEvenement[] {
  // Une même clé deux fois dans un lot ferait échouer l'insertion : on garde la première.
  const vues = new Set<string>();
  const lignes: LigneEvenement[] = [];
  for (const e of evenements) {
    if (vues.has(e.cle)) continue;
    vues.add(e.cle);
    lignes.push({
      company_id: companyId,
      type: e.type,
      cle: e.cle,
      mois_jeu: e.moisJeu,
      pas: e.pas,
      instant: new Date(e.instantMs).toISOString(),
      titre: e.titre,
      detail: e.detail,
    });
  }
  return lignes;
}

/**
 * Enregistre des événements avec la clé de service. Idempotent : une clé déjà présente pour
 * la société est ignorée (contrainte unique company_id + cle), donc rejouer un pas ou recharger
 * la page des missions ne duplique rien.
 */
export async function enregistrerEvenementsSupabase(
  supabase: SupabaseClient,
  companyId: string,
  evenements: readonly EvenementJournal[],
): Promise<void> {
  const lignes = lignesEvenements(companyId, evenements);
  if (lignes.length === 0) return;
  const { error } = await supabase
    .from("evenements")
    .upsert(lignes, { onConflict: "company_id,cle", ignoreDuplicates: true });
  if (error) throw new Error(`evenements ${companyId} : ${error.message}`);
}
