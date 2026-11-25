import type { EcritureComptable } from "../comptabilite/types.js";
import { centimes, type Centimes, type MoisJeu } from "../types/primitifs.js";
import type { PositionModule } from "./valider-plan.js";

/** Ce que l'achat d'un module lit dans le catalogue (packages/content/modules-v1.json). */
export type PrixModule = {
  readonly id: string;
  readonly prix_centimes: number;
  readonly amortissement_mois: number;
};

export type ModuleAchete = {
  readonly id_type: string;
  readonly quantite: number;
  readonly prixUnitaire: Centimes;
  readonly amortissementMois: number;
};

export type AchatModules =
  | {
      readonly ok: true;
      /** Modules nouveaux (déplacer ou pivoter un module déjà posé ne coûte rien). */
      readonly achetes: readonly ModuleAchete[];
      readonly total: Centimes;
    }
  | { readonly ok: false; readonly code: "type_inconnu"; readonly message: string };

function compter(modules: readonly PositionModule[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const m of modules) n.set(m.id_type, (n.get(m.id_type) ?? 0) + 1);
  return n;
}

/**
 * Modules à payer quand le plan passe de `ancien` à `nouveau` : pour chaque type, le nombre
 * posé en plus. Un module retiré n'est pas remboursé (V1 : pas de revente de matériel).
 */
export function achatModulesAmenagement(
  ancien: readonly PositionModule[],
  nouveau: readonly PositionModule[],
  catalogue: readonly PrixModule[],
): AchatModules {
  const prix = new Map(catalogue.map((c) => [c.id, c]));
  const avant = compter(ancien);
  const achetes: ModuleAchete[] = [];
  let total = 0;
  for (const [id, apres] of compter(nouveau)) {
    const quantite = apres - (avant.get(id) ?? 0);
    if (quantite <= 0) continue;
    const c = prix.get(id);
    if (!c) return { ok: false, code: "type_inconnu", message: `Module inconnu du catalogue : ${id}.` };
    if (!Number.isInteger(c.prix_centimes) || c.prix_centimes < 0) {
      throw new Error(`Prix du module ${id} invalide (${c.prix_centimes}).`);
    }
    achetes.push({
      id_type: id,
      quantite,
      prixUnitaire: centimes(c.prix_centimes),
      amortissementMois: c.amortissement_mois,
    });
    total += quantite * c.prix_centimes;
  }
  return { ok: true, achetes, total: centimes(total) };
}

/** Achat de matériel posé dans l'atelier : 2154 (matériel industriel) au débit, 512 au crédit. */
export function ecritureAchatModules(e: {
  readonly idEcriture: string;
  readonly mois: MoisJeu;
  readonly montant: Centimes;
}): EcritureComptable {
  return {
    id: e.idEcriture,
    mois: e.mois,
    libelle: "Achat de modules d'aménagement",
    lignes: [
      { compte: "2154", sens: "debit", montant: e.montant },
      { compte: "512", sens: "credit", montant: e.montant },
    ],
  };
}
