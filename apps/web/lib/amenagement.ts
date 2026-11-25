import type { TypeModule } from "@kapital/content";
import {
  achatModulesAmenagement,
  validerPlanEtage,
  type ErreurPlan,
  type PositionModule,
} from "@kapital/engine";

/** Module tel que stocké dans placed_modules (x, y comptés à partir de 1, comme le moteur). */
export type ModuleStocke = {
  readonly module_type_id: string;
  readonly x: number;
  readonly y: number;
  readonly pivote?: boolean | null;
};

export type GrilleAtelier = {
  readonly largeur_grille: number;
  readonly hauteur_grille: number;
  readonly entree_x: number;
  readonly entree_y: number;
};

export type DecisionAmenagement =
  | { readonly ok: true; readonly cout: number }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly erreurs?: readonly ErreurPlan[] };

function versMoteur(m: ModuleStocke): PositionModule {
  return { id_type: m.module_type_id, x: m.x, y: m.y, pivote: m.pivote ?? false };
}

function phrase(e: ErreurPlan): string {
  switch (e.type) {
    case "entree_hors_grille":
      return "L'entrée de l'atelier est hors de la grille.";
    case "type_inconnu":
      return `Module n° ${e.index + 1} inconnu (${e.id_type}).`;
    case "collision":
      return `Les modules n° ${e.index_a + 1} (${e.id_a}) et n° ${e.index_b + 1} (${e.id_b}) se chevauchent.`;
    case "hors_grille":
      return `Le module n° ${e.index + 1} (${e.id_type}) dépasse de l'atelier.`;
    case "passage_bloque":
      return `Le module n° ${e.index + 1} (${e.id_type}) n'est pas accessible depuis l'entrée.`;
  }
}

/**
 * Même règle que l'aperçu du navigateur : le plan est validé par le moteur (validerPlanEtage),
 * puis le prix des modules AJOUTÉS (catalogue modules-v1) est calculé et comparé à la trésorerie.
 */
export function deciderAmenagement(a: {
  grille: GrilleAtelier;
  ancien: readonly ModuleStocke[];
  nouveau: readonly ModuleStocke[];
  catalogue: readonly TypeModule[];
  tresorerie: number;
}): DecisionAmenagement {
  const nouveau = a.nouveau.map(versMoteur);
  const validation = validerPlanEtage(
    {
      largeur: a.grille.largeur_grille,
      hauteur: a.grille.hauteur_grille,
      entree_x: a.grille.entree_x,
      entree_y: a.grille.entree_y,
      modules: nouveau,
    },
    a.catalogue.map((m) => ({ id: m.id, largeur_grille: m.largeur_grille, hauteur_grille: m.hauteur_grille })),
  );
  if (!validation.valide) {
    return {
      ok: false,
      code: "plan_invalide",
      message: validation.erreurs.map(phrase).join(" "),
      erreurs: validation.erreurs,
    };
  }
  const achat = achatModulesAmenagement(a.ancien.map(versMoteur), nouveau, a.catalogue);
  if (!achat.ok) return { ok: false, code: achat.code, message: achat.message };
  if (achat.total > a.tresorerie) {
    const manque = achat.total - Math.max(a.tresorerie, 0);
    return {
      ok: false,
      code: "tresorerie_insuffisante",
      message: `Les modules ajoutés coûtent ${(achat.total / 100).toFixed(2).replace(".", ",")} € : il manque ${(manque / 100).toFixed(2).replace(".", ",")} € de trésorerie.`,
    };
  }
  return { ok: true, cout: achat.total };
}
