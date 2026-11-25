import type { Parametres } from "@kapital/content";

export type Gamme = "entree" | "milieu" | "haut";

export type ReglagesProduitDefaut = {
  readonly qualite_visee: number;
  readonly prix_vente_directe_centimes: number;
  readonly prix_revendeur_centimes: number;
  readonly production_mensuelle_cible: number;
};

function lire(params: Parametres, cle: string): number {
  const v = params[cle]?.valeur;
  if (v === undefined || !Number.isFinite(v)) throw new Error(`Paramètre manquant : ${cle}.`);
  return v;
}

/** Réglages d'un produit ajouté au catalogue, tous lus dans les paramètres (produit_defaut_*). */
export function reglagesProduitDefaut(gamme: Gamme, params: Parametres): ReglagesProduitDefaut {
  return {
    qualite_visee: lire(params, "produit_defaut_qualite_visee"),
    prix_vente_directe_centimes: lire(params, `produit_defaut_prix_vente_directe_centimes_${gamme}`),
    prix_revendeur_centimes: lire(params, `produit_defaut_prix_revendeur_centimes_${gamme}`),
    production_mensuelle_cible: lire(params, "produit_defaut_production_mensuelle_cible"),
  };
}
