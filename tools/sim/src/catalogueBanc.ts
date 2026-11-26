import {
  centimes,
  idFournisseur,
  idMatiere,
  idProduit,
  type CatalogueFournisseur,
  type FicheFabrication,
  type Fournisseur,
  type IdProduit,
} from "@kapital/engine";

// Catalogue du monde tel que la base le contient : produits, fournisseurs de matière et
// grossiste local. Ces données ne sont pas dans packages/content mais dans les migrations
// (graines SQL) ; le banc les recopie ici, sans rien inventer, pour tourner sans base.
//   - produits : supabase/migrations/0003_produits.sql
//   - fournisseurs et catalogue : supabase/migrations/0004_achats.sql
//   - grossiste local : supabase/migrations/0023_demarrage_sans_attente.sql (+ 0030)
// Si une migration change ces valeurs, ce fichier doit suivre.

export type ProduitDuMonde = {
  readonly id: IdProduit;
  readonly fiche: FicheFabrication;
};

export const PRODUITS: Readonly<Record<string, ProduitDuMonde>> = {
  prod_tshirt: {
    id: idProduit("prod_tshirt"),
    fiche: {
      matiere: idMatiere("mat_jersey_coton"),
      consommationParPiece: 0.8,
      fournituresParPiece: centimes(60),
      tempsStandardMinutes: 25,
    },
  },
  prod_chemise: {
    id: idProduit("prod_chemise"),
    fiche: {
      matiere: idMatiere("mat_popeline"),
      consommationParPiece: 1.8,
      fournituresParPiece: centimes(120),
      tempsStandardMinutes: 50,
    },
  },
  prod_sac_toile: {
    id: idProduit("prod_sac_toile"),
    fiche: {
      matiere: idMatiere("mat_toile_coton"),
      consommationParPiece: 0.6,
      fournituresParPiece: centimes(40),
      tempsStandardMinutes: 15,
    },
  },
};

export type FournisseurDuMonde = {
  readonly fournisseur: Fournisseur;
  readonly catalogue: CatalogueFournisseur;
};

function fournisseur(
  id: string,
  nom: string,
  /** Délai de livraison en heures réelles (suppliers.delai_heures, migration 0044). */
  delaiHeures: number,
  fiabilite: number,
  minimumCommande: number,
  delaiPaiementMois: number,
  lignes: readonly [string, number][],
): FournisseurDuMonde {
  return {
    fournisseur: {
      id: idFournisseur(id),
      nom,
      qualite: 0,
      delaiHeures,
      fiabilite,
      minimumCommande,
      delaiPaiementMois,
    },
    catalogue: {
      fournisseur: idFournisseur(id),
      lignes: lignes.map(([m, p]) => ({ matiere: idMatiere(m), prix: centimes(p) })),
    },
  };
}

export const FOURNISSEURS: Readonly<Record<string, FournisseurDuMonde>> = {
  four_fr: fournisseur("four_fr", "Textile France", 2, 0.95, 50, 1, [
    ["mat_jersey_coton", 500],
    ["mat_popeline", 900],
    ["mat_toile_coton", 600],
    ["mat_fournitures", 60],
  ]),
  four_pt: fournisseur("four_pt", "Têxteis Porto", 4, 0.9, 100, 1, [
    ["mat_jersey_coton", 420],
    ["mat_popeline", 750],
    ["mat_toile_coton", 500],
  ]),
  four_tr: fournisseur("four_tr", "Istanbul Fabrics", 6, 0.85, 300, 2, [
    ["mat_jersey_coton", 350],
    ["mat_popeline", 650],
  ]),
};

/** Grossiste local (0023) : livre en grossiste_delai_minutes (30 min), payé un mois plus tard, minimum 1 pièce. */
export const GROSSISTE_LOCAL = {
  id: "gros_local",
  delaiPaiementMois: 1,
  minimumCommande: 1,
} as const;

/**
 * Prix médian d'une matière au catalogue des fournisseurs : base du coût « usine » d'une
 * pièce, comme `coutUsineParPiece` côté serveur (packages/server/src/demarrage/lancement.ts).
 */
export function prixMedianMatiere(matiere: string): number {
  const prix = Object.values(FOURNISSEURS)
    .flatMap((f) => f.catalogue.lignes)
    .filter((l) => l.matiere === matiere)
    .map((l) => l.prix as number)
    .sort((a, b) => a - b);
  return prix[Math.floor(prix.length / 2)] ?? 0;
}
