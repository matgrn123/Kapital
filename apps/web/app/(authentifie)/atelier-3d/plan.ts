// Calculs d'affichage de l'atelier. Aucun chiffre en dur : les dimensions, prix et effets
// viennent du catalogue (packages/content/modules-v1.json), les heures et le rendement des
// paramètres, la validation du plan et la capacité du moteur (@kapital/engine).
//
// CONVENTION DES COORDONNÉES : placed_modules.x / y comptent les cases À PARTIR DE 1, comme
// validerPlanEtage du moteur (revalidé par le serveur dans sauvegarder-amenagement). Un module
// en x = 1, y = 1 occupe la première case. Le dessin (SceneIso) compte à partir de 0 : on
// retranche 1 uniquement au moment de dessiner.

import type { EffetModule, Parametres, TypeModule } from "@kapital/content";
import { artisansAuPoste, capaciteMinutes, idSalarie, centimes, rendement, validerPlanEtage, type ResultatValidation } from "@kapital/engine";
import { TAILLE_MEUBLE as TAILLES, type TypeMeuble } from "../../../components/iso/interieur";

export type ModulePlace = { module_type_id: string; x: number; y: number; pivote: boolean };
export type DimensionsAtelier = { largeur: number; hauteur: number; entree_x: number; entree_y: number };
/** Salarié tel que lu en base (expérience déjà à jour). */
export type SalarieAtelier = { id: string; poste: "artisan" | "encadrement"; experienceMois: number };
/** Emprise en cases, coordonnées à partir de 1. */
export type Emprise = { x: number; y: number; w: number; d: number };

export function empriseModule(m: ModulePlace, catalogue: readonly TypeModule[]): Emprise | null {
  const t = catalogue.find((c) => c.id === m.module_type_id);
  if (!t) return null;
  return {
    x: m.x,
    y: m.y,
    w: m.pivote ? t.hauteur_grille : t.largeur_grille,
    d: m.pivote ? t.largeur_grille : t.hauteur_grille,
  };
}

/** Validation du moteur sur le plan complet (même fonction que le serveur). */
export function validerPlan(atelier: DimensionsAtelier, plan: readonly ModulePlace[], catalogue: readonly TypeModule[]): ResultatValidation {
  return validerPlanEtage(
    { ...atelier, modules: plan.map((m) => ({ id_type: m.module_type_id, x: m.x, y: m.y, pivote: m.pivote })) },
    // Le moteur attend une liste modifiable : on lui passe une copie, sans toucher au catalogue.
    [...catalogue],
  );
}

/** Aperçu vert / rouge : le plan accepte-t-il ce module en plus ? */
export function apercuPlacement(
  atelier: DimensionsAtelier,
  plan: readonly ModulePlace[],
  candidat: ModulePlace,
  catalogue: readonly TypeModule[],
): ResultatValidation {
  return validerPlan(atelier, [...plan, candidat], catalogue);
}

const estPoste = (e: EffetModule) => e.type === "poste_artisan" || e.type === "poste_artisan_specialise";

function lire(p: Parametres, cle: string): number {
  const v = p[cle];
  if (!v) throw new Error(`Paramètre manquant : ${cle}`);
  return v.valeur;
}

export type ResumeProduction = {
  postes: number;
  auPoste: readonly SalarieAtelier[];
  artisans: number;
  postesSansArtisan: number;
  artisansSansPoste: number;
  stockageM3: number;
  /** Capacité du mois avec les artisans actuels (moteur : capaciteMinutes × rendement). */
  capaciteMinutes: number;
  /** Capacité si chaque poste avait un artisan au rendement maximal. */
  capaciteMaxMinutes: number;
};

export function resumeProduction(
  plan: readonly ModulePlace[],
  salaries: readonly SalarieAtelier[],
  catalogue: readonly TypeModule[],
  parametres: Parametres,
): ResumeProduction {
  const types = plan.map((m) => catalogue.find((c) => c.id === m.module_type_id)).filter((t): t is TypeModule => !!t);
  const postes = types.filter((t) => estPoste(t.effet)).length;
  const stockageM3 = types.reduce((s, t) => s + (t.effet.type === "stockage" ? t.effet.capacite_m3 : 0), 0);

  const heures = lire(parametres, "heures_mensuelles_legales");
  const rMin = lire(parametres, "rendement_atelier_min");
  const rMax = lire(parametres, "rendement_atelier_max");
  const tau = lire(parametres, "rendement_tau_mois");

  const pourMoteur = salaries.map((s) => ({
    id: idSalarie(s.id),
    poste: s.poste,
    salaireBrutMensuel: centimes(0),
    ancienneteMois: 0,
    experienceMois: s.experienceMois,
  }));
  const idsAuPoste = new Set(artisansAuPoste(pourMoteur, postes).map((s) => String(s.id)));
  const auPoste = salaries.filter((s) => idsAuPoste.has(s.id));
  const artisans = salaries.filter((s) => s.poste === "artisan").length;

  const capacite = auPoste.reduce((s, a) => s + capaciteMinutes(1, 1, heures, rendement(a.experienceMois, rMin, rMax, tau)), 0);
  return {
    postes,
    auPoste,
    artisans,
    postesSansArtisan: Math.max(0, postes - artisans),
    artisansSansPoste: Math.max(0, artisans - postes),
    stockageM3,
    capaciteMinutes: capacite,
    capaciteMaxMinutes: capaciteMinutes(postes, postes, heures, rMax),
  };
}

/** Charge d'amortissement par mois : prix du catalogue réparti sur sa durée (linéaire). */
export function chargeMensuelle(t: TypeModule): number {
  return Math.round(t.prix_centimes / t.amortissement_mois);
}

/** Texte de l'effet, lu dans le catalogue. */
export function texteEffet(e: EffetModule): string {
  switch (e.type) {
    case "poste_artisan":
      return "1 poste pour un artisan";
    case "poste_artisan_specialise":
      return `1 poste spécialisé (${e.produits_autorises.join(", ")})`;
    case "table_coupe":
      return `Coupe jusqu'à ${e.max_m2_par_mois} m² par mois, −${e.reduction_chute_pct} % de chute`;
    case "stockage":
      return `+${e.capacite_m3} m³ de stockage`;
    case "bureau":
      return "Un bureau pour l'encadrement";
    case "salle_reunion":
      return "Salle de réunion";
    case "showroom":
      return `+${e.bonus_conversion_revendeur_pct} % de conversion des revendeurs`;
    case "pause":
      return `Jusqu'à +${e.bonus_motivation_max_pct} % de motivation`;
    default:
      return "Aucun effet";
  }
}

const MEUBLES_PAR_EFFET: Record<EffetModule["type"], readonly TypeMeuble[]> = {
  poste_artisan: ["machine"],
  poste_artisan_specialise: ["presse"],
  table_coupe: ["coupe"],
  stockage: ["etagere"],
  bureau: ["bureau"],
  salle_reunion: ["bureau", "plante"],
  showroom: ["portant", "mannequin"],
  pause: ["plante", "cartons"],
  aucun: ["cartons"],
};


/**
 * Meubles du moteur de rendu à dessiner dans l'emprise d'un module, en coordonnées de dessin
 * (à partir de 0). Les meubles trop grands pour l'emprise sont remplacés par des cartons.
 */
export function meublesDuModule(effet: EffetModule["type"], e: Emprise): { meuble: TypeMeuble; x: number; y: number }[] {
  const ox = e.x - 1;
  const oy = e.y - 1;
  const sortie: { meuble: TypeMeuble; x: number; y: number }[] = [];
  let ligne = 0;
  for (const voulu of MEUBLES_PAR_EFFET[effet]) {
    const meuble: TypeMeuble = TAILLES[voulu].w <= e.w && TAILLES[voulu].d <= e.d ? voulu : "cartons";
    const t = TAILLES[meuble];
    if (ligne + t.d > e.d && sortie.length > 0) break;
    sortie.push({ meuble, x: ox + (e.w - t.w) / 2, y: oy + Math.min(ligne, e.d - t.d) + (sortie.length === 0 && MEUBLES_PAR_EFFET[effet].length === 1 ? (e.d - t.d) / 2 : 0) });
    ligne += t.d;
  }
  return sortie;
}
