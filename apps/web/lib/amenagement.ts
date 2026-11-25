import type { Parametres, TypeModule } from "@kapital/content";
import {
  achatModulesAmenagement,
  centimes,
  ecritureAchatModules,
  MODULE_POSE_A_LA_SIGNATURE,
  moisJeu,
  validerPlanEtage,
  type ErreurPlan,
  type ModuleAchete,
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

/** Une ligne d'écriture telle qu'affichée avant d'enregistrer (montants en centimes). */
export type LigneApercu = { readonly compte: string; readonly sens: "debit" | "credit"; readonly montant: number };
export type EcritureApercu = { readonly libelle: string; readonly lignes: readonly LigneApercu[] };

export type ModuleRetire = { readonly id_type: string; readonly quantite: number; readonly prixUnitaire: number };

export type DecisionAmenagement =
  | {
      readonly ok: true;
      /** Prix des modules ajoutés, payé à l'enregistrement (2154 / 512). */
      readonly cout: number;
      readonly achetes: readonly ModuleAchete[];
      /** Commande du plan prévu remplacé, remboursée (512 / 2154). */
      readonly remboursement: number;
      /** Écritures que le serveur passera, dans l'ordre (aperçu affiché avant d'enregistrer). */
      readonly ecritures: readonly EcritureApercu[];
      /** Effet net sur la banque (512) : remboursement − coût. */
      readonly variationTresorerie: number;
    }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly erreurs?: readonly ErreurPlan[] };

const euros = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;

function versMoteur(m: ModuleStocke): PositionModule {
  return { id_type: m.module_type_id, x: m.x, y: m.y, pivote: m.pivote ?? false };
}

export function phraseErreurPlan(e: ErreurPlan): string {
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

/** Postes posés d'office avec le local (paramètre bail_machines_a_la_signature) : pas à l'actif. */
export function postesFournisDepuisParametres(p: Parametres): number {
  const v = p["bail_machines_a_la_signature"];
  if (!v) throw new Error("Paramètre manquant : bail_machines_a_la_signature");
  return v.valeur;
}

/**
 * Modules achetés, par type, d'un plan : tous les modules, sauf les postes fournis avec le local
 * (même règle que modulesAchetes du moteur, qui décide de ce qui est amorti).
 */
function achetesParType(plan: readonly ModuleStocke[], postesFournis: number): Map<string, number> {
  const n = new Map<string, number>();
  for (const m of plan) n.set(m.module_type_id, (n.get(m.module_type_id) ?? 0) + 1);
  const postes = n.get(MODULE_POSE_A_LA_SIGNATURE);
  if (postes !== undefined) n.set(MODULE_POSE_A_LA_SIGNATURE, Math.max(0, postes - Math.max(0, postesFournis)));
  return n;
}

/** Modules achetés (inscrits en 2154) que le nouveau plan retire. */
export function retraitsAchetes(
  ancien: readonly ModuleStocke[],
  nouveau: readonly ModuleStocke[],
  catalogue: readonly TypeModule[],
  postesFournis: number,
): ModuleRetire[] {
  const avant = achetesParType(ancien, postesFournis);
  const apres = achetesParType(nouveau, postesFournis);
  const sortie: ModuleRetire[] = [];
  for (const [id, n] of avant) {
    const quantite = n - (apres.get(id) ?? 0);
    if (quantite <= 0) continue;
    sortie.push({ id_type: id, quantite, prixUnitaire: catalogue.find((c) => c.id === id)?.prix_centimes ?? 0 });
  }
  return sortie;
}

/**
 * Matériel des modules EN SERVICE restant à amortir : 2154 (débit) − 2815 (crédit), moins la
 * commande du plan prévu (payée en 2154 mais pas encore posée). Jamais négatif.
 */
export function valeurNetteMaterielEnService(
  lignes: readonly { readonly compte: string; readonly sens: string; readonly montant_centimes: number }[],
  coutPlanPrevu: number,
): number {
  let brut = 0;
  let amorti = 0;
  for (const l of lignes) {
    const signe = l.sens === "debit" ? 1 : -1;
    if (l.compte === "2154") brut += signe * Number(l.montant_centimes);
    if (l.compte === "2815") amorti -= signe * Number(l.montant_centimes);
  }
  return Math.max(0, brut - Math.max(0, coutPlanPrevu) - amorti);
}

/** Remboursement de la commande d'un plan prévu annulé : contre-passation de l'achat (512 / 2154). */
export function ecritureAnnulationCommande(montant: number): EcritureApercu {
  return {
    libelle: "Annulation de la commande de modules du plan prévu",
    lignes: [
      { compte: "512", sens: "debit", montant },
      { compte: "2154", sens: "credit", montant },
    ],
  };
}

/**
 * Même règle que l'aperçu du navigateur : le plan est validé par le moteur (validerPlanEtage),
 * puis le prix des modules AJOUTÉS (catalogue modules-v1) par rapport au plan EN SERVICE (`ancien`)
 * est calculé et comparé à la trésorerie (plus la commande du plan prévu remplacé, remboursée).
 *
 * Retirer un module acheté alors que le matériel n'est pas entièrement amorti est refusé :
 * sa sortie de l'actif (valeur nette en charge exceptionnelle) n'est pas encore validée.
 */
export function deciderAmenagement(a: {
  grille: GrilleAtelier;
  /** Plan en service (placed_modules.statut = 'actif'). */
  ancien: readonly ModuleStocke[];
  nouveau: readonly ModuleStocke[];
  catalogue: readonly TypeModule[];
  tresorerie: number;
  /** Paramètre bail_machines_a_la_signature. */
  postesFournis: number;
  /** Matériel des modules en service encore à amortir (2154 − 2815, hors commande prévue). */
  valeurNetteMateriel: number;
  /** Coût déjà payé pour le plan prévu en attente (0 s'il n'y en a pas). */
  coutPlanPrevu: number;
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
      message: validation.erreurs.map(phraseErreurPlan).join(" "),
      erreurs: validation.erreurs,
    };
  }

  const retraits = retraitsAchetes(a.ancien, a.nouveau, a.catalogue, a.postesFournis);
  if (retraits.length > 0 && a.valeurNetteMateriel > 0) {
    const noms = retraits.map((r) => a.catalogue.find((c) => c.id === r.id_type)?.nom ?? r.id_type).join(", ");
    return {
      ok: false,
      code: "retrait_module_achete",
      message:
        `Tu as acheté ce matériel (${noms}) et il n'est pas encore amorti (${euros(a.valeurNetteMateriel)} restent au bilan) : ` +
        "il ne peut pas encore être retiré. Tu peux le déplacer ou le pivoter.",
    };
  }

  const achat = achatModulesAmenagement(a.ancien.map(versMoteur), nouveau, a.catalogue);
  if (!achat.ok) return { ok: false, code: achat.code, message: achat.message };
  const remboursement = Math.max(0, a.coutPlanPrevu);
  const disponible = a.tresorerie + remboursement;
  if (achat.total > disponible) {
    const manque = achat.total - Math.max(disponible, 0);
    return {
      ok: false,
      code: "tresorerie_insuffisante",
      message: `Les modules ajoutés coûtent ${euros(achat.total)} : il manque ${euros(manque)} de trésorerie.`,
    };
  }

  const ecritures: EcritureApercu[] = [];
  if (remboursement > 0) ecritures.push(ecritureAnnulationCommande(remboursement));
  if (achat.total > 0) {
    // L'écriture du moteur : identifiant et mois sont fixés par le serveur à l'enregistrement.
    const e = ecritureAchatModules({ idEcriture: "apercu", mois: moisJeu(0), montant: centimes(achat.total) });
    ecritures.push({ libelle: e.libelle, lignes: e.lignes.map((l) => ({ compte: l.compte, sens: l.sens, montant: l.montant })) });
  }
  return {
    ok: true,
    cout: achat.total,
    achetes: achat.achetes,
    remboursement,
    ecritures,
    variationTresorerie: remboursement - achat.total,
  };
}
