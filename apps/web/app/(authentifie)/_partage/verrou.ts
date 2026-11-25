import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerParametresV1 } from "@kapital/content";
import {
  centimes,
  seuilsEtapesDepuis,
  verrouPour,
  type ActionVerrouillable,
  type EtapeEntreprise,
} from "@kapital/engine";
import type { ConditionEtape } from "./reponses";

export type VerrouAffiche = {
  etapeRequise: number;
  etapeActuelle: number;
  conditions: ConditionEtape[];
};

/** Côté serveur : l'action est-elle verrouillée par l'étape ? Verrou nul si elle est permise. */
export async function lireVerrou(
  supabase: SupabaseClient,
  companyId: string,
  action: ActionVerrouillable,
): Promise<{ verrou: VerrouAffiche | null; tresorerie: number; etape: number }> {
  const { data } = await supabase
    .from("companies")
    .select("etape, tresorerie_centimes, pieces_vendues_total, chiffre_affaires_cumule_ht_centimes")
    .eq("id", companyId)
    .maybeSingle();
  const etape = Number(data?.etape ?? 0);
  const tresorerie = Number(data?.tresorerie_centimes ?? 0);
  const v = verrouPour(
    action,
    {
      etape: etape as EtapeEntreprise,
      cumuls: {
        piecesVendues: Number(data?.pieces_vendues_total ?? 0),
        chiffreAffairesHt: centimes(Number(data?.chiffre_affaires_cumule_ht_centimes ?? 0)),
      },
      tresorerie: centimes(tresorerie),
    },
    seuilsEtapesDepuis(chargerParametresV1()),
  );
  return {
    verrou: v
      ? {
          etapeRequise: v.etapeRequise,
          etapeActuelle: v.etapeActuelle,
          conditions: v.conditions.map((c) => ({ ...c })),
        }
      : null,
    tresorerie,
    etape,
  };
}
