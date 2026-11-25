import { ValidationError } from "./validate.js";
import type {
  CategorieBatiment,
  EffetBatiment,
  EffetModule,
  GrilleBatiment,
  TypeBatiment,
  TypeModule,
} from "./catalogues.js";

/**
 * Licence de tout ce qui est dessiné en code (SVG isométrique, apps/web/components/iso) :
 * aucun fichier externe, donc rien à inscrire dans assets/LICENCES.md.
 */
export const LICENCE_DESSIN_SVG =
  "Dessin SVG original du projet Kapital, tracé en code (apps/web/components/iso), sans fichier externe";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estObjet(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function exigerChaineNonVide(
  obj: Record<string, unknown>,
  champ: string,
  contexte: string,
): string {
  const v = obj[champ];
  if (typeof v !== "string" || v.trim() === "") {
    throw new ValidationError(
      `${contexte} : champ "${champ}" manquant ou vide.`,
    );
  }
  return v;
}

function exigerEntierPositif(
  obj: Record<string, unknown>,
  champ: string,
  contexte: string,
  strict = false,
): number {
  const v = obj[champ];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ValidationError(
      `${contexte} : "${champ}" doit être un nombre fini.`,
    );
  }
  if (!Number.isInteger(v)) {
    throw new ValidationError(
      `${contexte} : "${champ}" doit être un entier (montant en centimes).`,
    );
  }
  if (strict && v <= 0) {
    throw new ValidationError(
      `${contexte} : "${champ}" doit être strictement positif (reçu ${v}).`,
    );
  }
  if (!strict && v < 0) {
    throw new ValidationError(
      `${contexte} : "${champ}" ne peut pas être négatif (reçu ${v}).`,
    );
  }
  return v;
}

// ---------------------------------------------------------------------------
// Validation de l'EffetModule (union discriminée)
// ---------------------------------------------------------------------------

const TYPES_EFFET_VALIDES = [
  "poste_artisan",
  "poste_artisan_specialise",
  "table_coupe",
  "stockage",
  "bureau",
  "salle_reunion",
  "showroom",
  "pause",
  "aucun",
] as const;

function validerEffet(brut: unknown, contexte: string): EffetModule {
  if (!estObjet(brut)) {
    throw new ValidationError(`${contexte} : "effet" doit être un objet.`);
  }

  const type = brut["type"];
  if (typeof type !== "string" || !(TYPES_EFFET_VALIDES as readonly string[]).includes(type)) {
    throw new ValidationError(
      `${contexte} : effet.type "${type}" inconnu. Valeurs : ${TYPES_EFFET_VALIDES.join(", ")}.`,
    );
  }

  switch (type) {
    case "poste_artisan":
    case "bureau":
    case "salle_reunion":
    case "aucun":
      return { type } as EffetModule;

    case "poste_artisan_specialise": {
      const pa = brut["produits_autorises"];
      if (!Array.isArray(pa) || pa.length === 0 || pa.some((p) => typeof p !== "string")) {
        throw new ValidationError(
          `${contexte} : effet "poste_artisan_specialise" nécessite produits_autorises (tableau de chaînes non vide).`,
        );
      }
      return { type: "poste_artisan_specialise", produits_autorises: pa as string[] };
    }

    case "table_coupe": {
      const max = brut["max_m2_par_mois"];
      const red = brut["reduction_chute_pct"];
      if (typeof max !== "number" || max <= 0) {
        throw new ValidationError(
          `${contexte} : effet "table_coupe" nécessite max_m2_par_mois > 0.`,
        );
      }
      if (typeof red !== "number" || red < 0 || red > 100) {
        throw new ValidationError(
          `${contexte} : effet "table_coupe" nécessite reduction_chute_pct entre 0 et 100.`,
        );
      }
      return { type: "table_coupe", max_m2_par_mois: max, reduction_chute_pct: red };
    }

    case "stockage": {
      const cap = brut["capacite_m3"];
      if (typeof cap !== "number" || cap <= 0) {
        throw new ValidationError(
          `${contexte} : effet "stockage" nécessite capacite_m3 > 0.`,
        );
      }
      return { type: "stockage", capacite_m3: cap };
    }

    case "showroom": {
      const bonus = brut["bonus_conversion_revendeur_pct"];
      if (typeof bonus !== "number" || bonus < 0 || bonus > 100) {
        throw new ValidationError(
          `${contexte} : effet "showroom" nécessite bonus_conversion_revendeur_pct entre 0 et 100.`,
        );
      }
      return { type: "showroom", bonus_conversion_revendeur_pct: bonus };
    }

    case "pause": {
      const bm = brut["bonus_motivation_max_pct"];
      if (typeof bm !== "number" || bm < 0) {
        throw new ValidationError(
          `${contexte} : effet "pause" nécessite bonus_motivation_max_pct ≥ 0.`,
        );
      }
      if (bm > 5) {
        throw new ValidationError(
          `${contexte} : bonus_motivation_max_pct ne peut pas dépasser 5 % (reçu ${bm}).`,
        );
      }
      return { type: "pause", bonus_motivation_max_pct: bm };
    }

    default:
      throw new ValidationError(`${contexte} : effet.type inattendu.`);
  }
}

// ---------------------------------------------------------------------------
// Rendu : chemin du modèle et licence (3D-1)
// ---------------------------------------------------------------------------

/**
 * Deux cas seulement :
 * - modele_path null : dessin SVG fait en code, licence = LICENCE_DESSIN_SVG ;
 * - modele_path sous /models/ : modèle externe, licence CC0 obligatoire (CLAUDE.md, règles de rendu).
 */
function validerRendu(
  brut: Record<string, unknown>,
  contexte: string,
): { modele_path: string | null; modele_licence: string } {
  if (!("modele_path" in brut)) {
    throw new ValidationError(
      `${contexte} : champ "modele_path" manquant (null si le dessin est fait en SVG).`,
    );
  }
  const chemin = brut["modele_path"];
  const licence = brut["modele_licence"];
  if (typeof licence !== "string" || licence.trim() === "") {
    throw new ValidationError(`${contexte} : champ "modele_licence" manquant ou vide.`);
  }
  if (chemin === null) {
    if (licence !== LICENCE_DESSIN_SVG) {
      throw new ValidationError(
        `${contexte} : sans modele_path, modele_licence doit être « ${LICENCE_DESSIN_SVG} ».`,
      );
    }
    return { modele_path: null, modele_licence: licence };
  }
  if (typeof chemin !== "string" || !chemin.startsWith("/models/")) {
    throw new ValidationError(
      `${contexte} : modele_path doit commencer par /models/ ou valoir null.`,
    );
  }
  if (!/\bCC0\b/.test(licence)) {
    throw new ValidationError(
      `${contexte} : un modèle externe doit être sous licence CC0 (reçu « ${licence} »).`,
    );
  }
  return { modele_path: chemin, modele_licence: licence };
}

// ---------------------------------------------------------------------------
// Grille et effet des bâtiments (3D-1, AE-9)
// ---------------------------------------------------------------------------

function validerGrille(brut: unknown, contexte: string): GrilleBatiment {
  if (!estObjet(brut)) {
    throw new ValidationError(`${contexte} : "grille" manquante (largeur, hauteur, entree_x, entree_y).`);
  }
  const entier = (champ: string, min: number): number => {
    const v = brut[champ];
    if (typeof v !== "number" || !Number.isInteger(v) || v < min) {
      throw new ValidationError(`${contexte} : grille.${champ} doit être un entier ≥ ${min}.`);
    }
    return v;
  };
  const largeur = entier("largeur", 1);
  const hauteur = entier("hauteur", 1);
  const entree_x = entier("entree_x", 0);
  const entree_y = entier("entree_y", 0);
  if (entree_x >= largeur || entree_y >= hauteur) {
    throw new ValidationError(`${contexte} : l'entree (${entree_x}, ${entree_y}) est hors de la grille.`);
  }
  const auBord = entree_x === 0 || entree_y === 0 || entree_x === largeur - 1 || entree_y === hauteur - 1;
  if (!auBord) {
    throw new ValidationError(`${contexte} : l'entree doit être sur le bord de la grille.`);
  }
  return { largeur, hauteur, entree_x, entree_y };
}

function validerEffetBatiment(brut: unknown, contexte: string): EffetBatiment {
  if (!estObjet(brut)) {
    throw new ValidationError(`${contexte} : "effet" (effet économique) doit être un objet.`);
  }
  const type = brut["type"];
  if (type === "production") return { type: "production" };
  if (type === "point_de_vente") {
    const passants = brut["passants_par_jour"];
    if (typeof passants !== "number" || !Number.isInteger(passants) || passants <= 0) {
      throw new ValidationError(`${contexte} : passants_par_jour doit être un entier > 0.`);
    }
    const bonus = brut["bonus_desirabilite_points_par_mois"];
    if (typeof bonus !== "number" || !Number.isFinite(bonus) || bonus < 0 || bonus > 100) {
      throw new ValidationError(
        `${contexte} : bonus_desirabilite_points_par_mois doit être entre 0 et 100 (jauge de désirabilité).`,
      );
    }
    return { type: "point_de_vente", passants_par_jour: passants, bonus_desirabilite_points_par_mois: bonus };
  }
  throw new ValidationError(
    `${contexte} : effet.type "${String(type)}" inconnu. Valeurs : production, point_de_vente.`,
  );
}

/** Effet attendu selon la catégorie (les autres catégories n'ont pas encore d'entrée au catalogue). */
const EFFET_PAR_CATEGORIE: Partial<Record<CategorieBatiment, EffetBatiment["type"]>> = {
  atelier: "production",
  boutique: "point_de_vente",
};

// ---------------------------------------------------------------------------
// validerBatiments
// ---------------------------------------------------------------------------

const CATEGORIES_VALIDES: CategorieBatiment[] = [
  "atelier",
  "entrepot",
  "bureau",
  "prestige",
  "boutique",
];

export function validerBatiments(data: unknown): TypeBatiment[] {
  if (!Array.isArray(data)) {
    throw new ValidationError(
      "batiments-v1.json : la racine doit être un tableau JSON.",
    );
  }

  return data.map((brut, index) => {
    if (!estObjet(brut)) {
      throw new ValidationError(`Bâtiment #${index} : doit être un objet.`);
    }

    const id = exigerChaineNonVide(brut, "id", `Bâtiment #${index}`);
    const ctx = `Bâtiment "${id}"`;

    const nom = exigerChaineNonVide(brut, "nom", ctx);

    const categorie = brut["categorie"];
    if (typeof categorie !== "string" || !(CATEGORIES_VALIDES as string[]).includes(categorie)) {
      throw new ValidationError(
        `${ctx} : categorie "${categorie}" invalide. Valeurs : ${CATEGORIES_VALIDES.join(", ")}.`,
      );
    }

    const surface = brut["surface_m2"];
    if (typeof surface !== "number" || surface <= 0) {
      throw new ValidationError(`${ctx} : surface_m2 doit être > 0.`);
    }

    const etages = brut["nb_etages"];
    if (typeof etages !== "number" || !Number.isInteger(etages) || etages < 1) {
      throw new ValidationError(`${ctx} : nb_etages doit être un entier ≥ 1.`);
    }

    const zones = brut["zones_amenageables"];
    if (!Array.isArray(zones) || zones.some((z) => typeof z !== "string")) {
      throw new ValidationError(`${ctx} : zones_amenageables doit être un tableau de chaînes.`);
    }

    const prix_achat = exigerEntierPositif(brut, "prix_achat_centimes", ctx);
    const loyer = exigerEntierPositif(brut, "loyer_mensuel_centimes", ctx);
    const charges = exigerEntierPositif(brut, "charges_mensuelles_centimes", ctx);

    const etape = brut["etape_debloquee"];
    if (typeof etape !== "number" || !Number.isInteger(etape) || etape < 0) {
      throw new ValidationError(`${ctx} : etape_debloquee doit être un entier ≥ 0.`);
    }

    const source_prix = exigerChaineNonVide(brut, "source_prix", ctx);
    const grille = validerGrille(brut["grille"], ctx);
    const effet = validerEffetBatiment(brut["effet"], ctx);
    const attendu = EFFET_PAR_CATEGORIE[categorie as CategorieBatiment];
    if (attendu !== undefined && effet.type !== attendu) {
      throw new ValidationError(
        `${ctx} : un bâtiment de catégorie "${categorie}" doit avoir l'effet "${attendu}" (reçu "${effet.type}").`,
      );
    }
    const source_effet = exigerChaineNonVide(brut, "source_effet", ctx);
    const { modele_path, modele_licence } = validerRendu(brut, ctx);

    return {
      id,
      nom,
      categorie: categorie as CategorieBatiment,
      surface_m2: surface,
      nb_etages: etages,
      zones_amenageables: zones as string[],
      prix_achat_centimes: prix_achat,
      loyer_mensuel_centimes: loyer,
      charges_mensuelles_centimes: charges,
      etape_debloquee: etape,
      source_prix,
      grille,
      effet,
      source_effet,
      modele_path,
      modele_licence,
    } satisfies TypeBatiment;
  });
}

// ---------------------------------------------------------------------------
// validerModules
// ---------------------------------------------------------------------------

export function validerModules(data: unknown): TypeModule[] {
  if (!Array.isArray(data)) {
    throw new ValidationError(
      "modules-v1.json : la racine doit être un tableau JSON.",
    );
  }

  return data.map((brut, index) => {
    if (!estObjet(brut)) {
      throw new ValidationError(`Module #${index} : doit être un objet.`);
    }

    const id = exigerChaineNonVide(brut, "id", `Module #${index}`);
    const ctx = `Module "${id}"`;

    const nom = exigerChaineNonVide(brut, "nom", ctx);

    const larg = brut["largeur_grille"];
    if (typeof larg !== "number" || !Number.isInteger(larg) || larg < 1) {
      throw new ValidationError(`${ctx} : largeur_grille doit être un entier ≥ 1.`);
    }

    const haut = brut["hauteur_grille"];
    if (typeof haut !== "number" || !Number.isInteger(haut) || haut < 1) {
      throw new ValidationError(`${ctx} : hauteur_grille doit être un entier ≥ 1.`);
    }

    if (typeof brut["peut_pivoter"] !== "boolean") {
      throw new ValidationError(`${ctx} : peut_pivoter doit être un booléen.`);
    }

    const prix = exigerEntierPositif(brut, "prix_centimes", ctx);

    const amort = brut["amortissement_mois"];
    if (typeof amort !== "number" || !Number.isInteger(amort) || amort < 1) {
      throw new ValidationError(`${ctx} : amortissement_mois doit être un entier ≥ 1.`);
    }

    if (!("effet" in brut)) {
      throw new ValidationError(`${ctx} : champ "effet" manquant.`);
    }
    const effet = validerEffet(brut["effet"], ctx);

    const source_prix = exigerChaineNonVide(brut, "source_prix", ctx);

    const { modele_path, modele_licence } = validerRendu(brut, ctx);

    return {
      id,
      nom,
      largeur_grille: larg,
      hauteur_grille: haut,
      peut_pivoter: brut["peut_pivoter"] as boolean,
      prix_centimes: prix,
      amortissement_mois: amort,
      effet,
      source_prix,
      modele_path,
      modele_licence,
    } satisfies TypeModule;
  });
}
