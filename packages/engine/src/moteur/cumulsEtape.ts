import type { Entreprise } from "../types/entreprise.js";
import { centimes } from "../types/primitifs.js";
import type { CumulMois } from "./donneesMois.js";

function totalServi(c: CumulMois): number {
  return Object.values(c.serviParLigne).reduce((s, q) => s + q, 0);
}

/**
 * Compteurs de progression (pièces vendues, chiffre d'affaires HT cumulé) mis à jour à
 * chaque vente : on ajoute ce que le pas vient de servir (différence des cumuls du mois
 * avant et après le pas). La clôture ne les touche plus : pas de double comptage.
 */
export function ajouterVentesAuxCumulsEtape(
  entreprise: Entreprise,
  cumulAvant: CumulMois,
  cumulApres: CumulMois,
): Entreprise {
  const pieces = totalServi(cumulApres) - totalServi(cumulAvant);
  const ca = cumulApres.chiffreAffairesHt - cumulAvant.chiffreAffairesHt;
  if (pieces === 0 && ca === 0) return entreprise;
  return {
    ...entreprise,
    cumulsEtape: {
      piecesVendues: (entreprise.cumulsEtape?.piecesVendues ?? 0) + pieces,
      chiffreAffairesHt: centimes((entreprise.cumulsEtape?.chiffreAffairesHt ?? 0) + ca),
    },
  };
}
