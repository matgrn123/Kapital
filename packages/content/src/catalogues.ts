export type CategorieBatiment = "atelier" | "entrepot" | "bureau" | "prestige" | "boutique";

/**
 * Grille d'aménagement d'un bâtiment (cases de 1 m × 1 m, docs/batiments-3d-groupe.md section 4).
 * L'entrée est une case du bord : c'est d'elle que part le contrôle « chaque poste est atteignable ».
 */
export type GrilleBatiment = {
  largeur: number;
  hauteur: number;
  entree_x: number;
  entree_y: number;
};

/**
 * Effet économique d'un bâtiment dans le moteur.
 * - production : la grille accueille les postes de travail et le stockage ; elle plafonne la production.
 * - point_de_vente : boutique (canal boutique, AE-9) ; les passants nourrissent la demande du point de vente,
 *   le bonus s'ajoute chaque mois à la désirabilité de la marque (jauge de 0 à 100).
 */
export type EffetBatiment =
  | { type: "production" }
  | {
      type: "point_de_vente";
      passants_par_jour: number;
      bonus_desirabilite_points_par_mois: number;
    };

export type TypeBatiment = {
  id: string;
  nom: string;
  categorie: CategorieBatiment;
  surface_m2: number;
  nb_etages: number;
  zones_amenageables: string[];
  prix_achat_centimes: number;
  loyer_mensuel_centimes: number;
  charges_mensuelles_centimes: number;
  etape_debloquee: number;
  source_prix: string;
  grille: GrilleBatiment;
  effet: EffetBatiment;
  /** D'où viennent les chiffres de l'effet (passants, bonus) ou la règle qu'il applique. */
  source_effet: string;
  /** Chemin d'un modèle externe sous /models/, ou null quand le dessin est fait en code (SVG). */
  modele_path: string | null;
  /** Licence du rendu : CC0 pour un modèle externe, ou la licence du dessin SVG original du projet. */
  modele_licence: string;
};

export type EffetModule =
  | { type: "poste_artisan" }
  | { type: "poste_artisan_specialise"; produits_autorises: string[] }
  | { type: "table_coupe"; max_m2_par_mois: number; reduction_chute_pct: number }
  | { type: "stockage"; capacite_m3: number }
  | { type: "bureau" }
  | { type: "salle_reunion" }
  | { type: "showroom"; bonus_conversion_revendeur_pct: number }
  | { type: "pause"; bonus_motivation_max_pct: number }
  | { type: "aucun" };

export type TypeModule = {
  id: string;
  nom: string;
  largeur_grille: number;
  hauteur_grille: number;
  peut_pivoter: boolean;
  prix_centimes: number;
  amortissement_mois: number;
  effet: EffetModule;
  source_prix: string;
  /** Chemin d'un modèle externe sous /models/, ou null quand le dessin est fait en code (SVG). */
  modele_path: string | null;
  /** Licence du rendu : CC0 pour un modèle externe, ou la licence du dessin SVG original du projet. */
  modele_licence: string;
};
