// Ce que le joueur lit ne doit jamais contenir d'identifiant technique
// (prod_tshirt, mat_jersey_coton, entree). Fonctions d'affichage uniquement.

const IDENTIFIANT_PRODUIT = /\bprod_[a-z0-9_]+/g;

/** Remplace les identifiants de produits d'un libellé comptable par leur nom. */
export function libelleLisible(
  libelle: string,
  nomsProduits: Readonly<Record<string, string>>,
): string {
  return libelle.replace(IDENTIFIANT_PRODUIT, (id) => nomsProduits[id] ?? id);
}

const GAMMES: Readonly<Record<string, string>> = {
  entree: "Entrée de gamme",
  milieu: "Milieu de gamme",
  haut: "Haut de gamme",
};

export function libelleGamme(gamme: string): string {
  return GAMMES[gamme] ?? gamme;
}

/** Nom d'une matière au milieu d'une phrase (« 0,8 m de jersey de coton bio »). */
export function nomMatiere(
  id: string,
  nomsMatieres: Readonly<Record<string, string>>,
): string {
  const nom = nomsMatieres[id];
  if (nom) return nom.charAt(0).toLowerCase() + nom.slice(1);
  return id.replace(/^mat_/, "").replace(/_/g, " ");
}
