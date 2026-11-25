// Écran Vente : bornes des curseurs de prix et besoin en fonds de roulement.
// Le BFR est calculé par le moteur (besoinEnFondsDeRoulement) à partir des
// lignes du grand livre lues en base. Montants en centimes.

import {
  besoinEnFondsDeRoulement,
  centimes,
  coutRevientFaconnier,
  moisJeu,
  planComptableV1,
  type BesoinEnFondsDeRoulement,
  type EcritureComptable,
} from "@kapital/engine";

/**
 * Bornes du curseur de prix public TTC : du prix sans perte (coût de revient
 * plus TVA) au double du plus haut entre ce plancher et le prix actuel. Le prix
 * actuel reste toujours dans les bornes.
 */
export function bornesPrix(e: { coutRevient: number | null; prixActuel: number; tauxTva: number }): {
  min: number;
  max: number;
} {
  const plancher = e.coutRevient === null ? 0 : Math.round(e.coutRevient * (1 + e.tauxTva));
  const min = Math.min(plancher, e.prixActuel);
  const max = 2 * Math.max(plancher, e.prixActuel);
  return { min, max };
}

const COMPTES_BFR = new Set(["31", "35", "411", "401"]);

export function besoinFondsRoulementDepuisLignes(
  lignes: ReadonlyArray<{
    ecriture_id: string;
    mois_jeu: number;
    libelle: string;
    compte: string;
    sens: "debit" | "credit";
    montant_centimes: number;
  }>,
): BesoinEnFondsDeRoulement {
  const parEcriture = new Map<string, { mois: number; libelle: string; lignes: EcritureComptable["lignes"][number][] }>();
  for (const l of lignes) {
    if (!COMPTES_BFR.has(l.compte)) continue;
    const ec = parEcriture.get(l.ecriture_id) ?? { mois: l.mois_jeu, libelle: l.libelle, lignes: [] };
    ec.lignes.push({ compte: l.compte, sens: l.sens, montant: centimes(l.montant_centimes) });
    parEcriture.set(l.ecriture_id, ec);
  }
  const gl = planComptableV1();
  const ecritures: EcritureComptable[] = [...parEcriture].map(([id, e]) => ({
    id,
    mois: moisJeu(e.mois),
    libelle: e.libelle,
    lignes: e.lignes,
  }));
  return besoinEnFondsDeRoulement({ ...gl, ecritures });
}

/**
 * Coût de revient estimé d'une pièce avant toute production : matière au prix le plus bas
 * (chute comprise) + fournitures + façon, chez le façonnier qui revient le moins cher.
 * Le calcul est celui du moteur (coutRevientFaconnier) ; null si aucun façonnier ne fait le produit.
 */
export function coutRevientEstimeSansStock(e: {
  produit: { consommationParPiece: number; fournituresCentimes: number };
  prixMatiereCentimes: readonly number[];
  tauxChute: number;
  faconniers: ReadonlyArray<{ prixFaconCentimes: number; fournitMatiere: boolean }>;
}): number | null {
  const prixMatiere = e.prixMatiereCentimes.length > 0 ? Math.min(...e.prixMatiereCentimes) : 0;
  const couts = e.faconniers.map((f) =>
    f.fournitMatiere
      ? f.prixFaconCentimes
      : coutRevientFaconnier({
          prixMatiereParUnite: centimes(prixMatiere),
          consommationParPiece: e.produit.consommationParPiece,
          tauxChute: e.tauxChute,
          fournitures: centimes(e.produit.fournituresCentimes),
          prixFaconParPiece: centimes(f.prixFaconCentimes),
        }),
  );
  return couts.length > 0 ? Math.min(...couts) : null;
}
