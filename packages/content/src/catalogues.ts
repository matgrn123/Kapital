export type CategorieBatiment = "atelier" | "entrepot" | "bureau" | "prestige";

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
  modele_path: string;
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
  modele_path: string | null;
  modele_licence: string | null;
};
