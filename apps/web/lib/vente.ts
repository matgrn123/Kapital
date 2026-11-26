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
import { formaterEuros } from "./formatage";

/** Pas des curseurs de prix de l'écran Vente, en centimes : chaque cran tombe sur un prix rond. */
export const PAS_PRIX_CENTIMES = 10;

/**
 * Bornes du curseur de prix public TTC : du prix sans perte (coût de revient
 * plus TVA) au double du plus haut entre ce plancher et le prix actuel. Le prix
 * actuel reste toujours dans les bornes. Avec un pas, le minimum est arrondi au
 * pas en dessous et le maximum au pas au-dessus : un curseur avance par crans
 * depuis son minimum, sans quoi tous ses crans tomberaient sur des prix comme 19,93 €.
 */
export function bornesPrix(e: { coutRevient: number | null; prixActuel: number; tauxTva: number; pas?: number }): {
  min: number;
  max: number;
} {
  const plancher = e.coutRevient === null ? 0 : Math.round(e.coutRevient * (1 + e.tauxTva));
  const min = Math.min(plancher, e.prixActuel);
  const max = 2 * Math.max(plancher, e.prixActuel);
  const pas = e.pas && e.pas > 0 ? e.pas : 1;
  return { min: Math.floor(min / pas) * pas, max: Math.ceil(max / pas) * pas };
}

/**
 * Textes de coût d'un produit qu'on ajoute au catalogue. Le premier produit arrive avec
 * la série de lancement, payée au coût de l'usine (calcul du serveur, coutUsineParPiece) :
 * c'est ce coût-là qu'on annonce d'abord ; le façonnier le moins cher vient ensuite, à part.
 */
export function coutsProduitAAjouter(e: {
  serie: { quantite: number; coutParPiece: number } | null;
  coutFaconnier: number | null;
}): { principal: string | null; ensuite: string | null } {
  const facon = e.coutFaconnier === null ? null : `${formaterEuros(e.coutFaconnier)} €`;
  if (e.serie) {
    const quantite = e.serie.quantite.toLocaleString("fr-FR");
    return {
      principal: `Série de lancement : ${quantite} pièces à ${formaterEuros(e.serie.coutParPiece)} € la pièce`,
      ensuite: facon === null ? null : `Ensuite dès ${facon} chez un façonnier`,
    };
  }
  return { principal: facon === null ? null : `Coût de revient dès ${facon} la pièce chez un façonnier`, ensuite: null };
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
