import type { Parametres } from "@kapital/content";
import { facteurEmplacement, pointsDeVenteOuverts, prixBoutique } from "../boutique/boutique.js";
import type { Canal, Entreprise, Gamme, ProduitEntreprise } from "../types/entreprise.js";
import type { Monde } from "../types/monde.js";
import {
  type Centimes,
  type IdEntreprise,
  type IdProduit,
} from "../types/primitifs.js";
import {
  partsDeMarche,
  segmentDepuisParametres,
} from "./attraction.js";
import type { OffreEntreprise, PartsSegment } from "./types.js";

export type VenteGeneree = {
  readonly entreprise: IdEntreprise;
  readonly produit: IdProduit;
  readonly gamme: Gamme;
  readonly canal: Canal;
  readonly quantite: number;
  readonly prixUnitaireCentimes: Centimes;
};

const GAMMES: readonly Gamme[] = ["entree", "milieu", "haut"];
const CANAUX: readonly Canal[] = ["vente_directe", "revendeur", "boutique"];

function tailleMarcheMois(params: Parametres, gamme: Gamme): number {
  const p = params[`taille_marche_mois_${gamme}`];
  if (!p) {
    throw new Error(`Paramètre manquant : taille_marche_mois_${gamme}`);
  }
  return p.valeur;
}

/** Prix TTC d'un produit sur un canal ; en boutique, le prix direct quand aucun prix boutique n'est fixé. */
export function prixDuCanal(produit: ProduitEntreprise, canal: Canal): Centimes {
  return canal === "boutique" ? prixBoutique(produit) : produit.prix[canal];
}

/**
 * AE-10, branchement simple en attendant le marché complet (lot C) : une boutique ouverte
 * s'adresse à la même demande que la vente en ligne (même part de canal, même attrait, mais
 * au prix boutique), multipliée par ses passants rapportés aux passants moyens des boutiques
 * du catalogue (facteurEmplacement : 1 pour une boutique moyenne). Plusieurs boutiques : les
 * facteurs s'additionnent. 0 sans boutique ouverte : pendant les travaux, aucune demande.
 */
export function facteurDemandeBoutique(ent: Entreprise, mois: Monde["moisCourant"]): number {
  return pointsDeVenteOuverts(ent, mois).reduce((s, p) => s + facteurEmplacement(p), 0);
}

function entrepriseVendProduit(
  ent: Entreprise,
  produit: ProduitEntreprise,
  canal: Canal,
  facteur: number,
): boolean {
  if (ent.statut !== "active") return false;
  if (!(facteur > 0)) return false;
  const prix = prixDuCanal(produit, canal);
  if (prix <= 0) return false;
  return true;
}

function construireOffre(
  ent: Entreprise,
  produit: ProduitEntreprise,
  canal: Canal,
): OffreEntreprise {
  const presenceRev = canal === "revendeur" ? 1 : 0;
  return {
    entreprise: ent.id,
    qualite: produit.qualiteVisee,
    notoriete: ent.marque.notoriete,
    desirabilite: ent.marque.desirabilite,
    presenceRevendeur: presenceRev,
    prix: prixDuCanal(produit, canal),
  };
}

function prixReferenceSegment(
  offres: readonly OffreEntreprise[],
  fallback: number,
): number {
  if (offres.length === 0) return fallback;
  const prixs = offres.map((o) => o.prix).sort((a, b) => a - b);
  const milieu = Math.floor(prixs.length / 2);
  return prixs[milieu] ?? fallback;
}

const PRIX_REFERENCE_PAR_GAMME_FALLBACK: Record<Gamme, number> = {
  entree: 2000,
  milieu: 6000,
  haut: 15000,
};

export function calculerVentesMois(
  monde: Monde,
  dureeMois: number,
  params: Parametres,
): readonly VenteGeneree[] {
  if (dureeMois <= 0) return [];
  const ventes: VenteGeneree[] = [];

  for (const gamme of GAMMES) {
    const entreprisesGamme = monde.entreprises.filter((e) => e.gamme === gamme);
    if (entreprisesGamme.length === 0) continue;

    const taille = tailleMarcheMois(params, gamme);
    if (taille <= 0) continue;

    for (const canal of CANAUX) {
      const offresAvecContexte: Array<{
        entreprise: Entreprise;
        produit: ProduitEntreprise;
        offre: OffreEntreprise;
        facteur: number;
      }> = [];
      for (const ent of entreprisesGamme) {
        const facteur = canal === "boutique" ? facteurDemandeBoutique(ent, monde.moisCourant) : 1;
        for (const prod of ent.catalogue) {
          if (!entrepriseVendProduit(ent, prod, canal, facteur)) continue;
          offresAvecContexte.push({
            entreprise: ent,
            produit: prod,
            offre: construireOffre(ent, prod, canal),
            facteur,
          });
        }
      }
      if (offresAvecContexte.length === 0) continue;

      const prixRef = prixReferenceSegment(
        offresAvecContexte.map((o) => o.offre),
        PRIX_REFERENCE_PAR_GAMME_FALLBACK[gamme],
      );
      const segment = segmentDepuisParametres(params, gamme, prixRef);
      const parts: PartsSegment = partsDeMarche(
        segment,
        offresAvecContexte.map((o) => o.offre),
      );

      // Volume total adressable par ce canal dans cette gamme sur la durée.
      // La boutique reprend la part de la vente en ligne (voir facteurDemandeBoutique).
      const partCanal = canal === "revendeur" ? 0.4 : 0.6;
      const volumeTotal = taille * dureeMois * partCanal;

      for (const o of offresAvecContexte) {
        const part = parts.parts[o.entreprise.id] ?? 0;
        const quantite = Math.floor(volumeTotal * part * o.facteur);
        if (quantite <= 0) continue;
        ventes.push({
          entreprise: o.entreprise.id,
          produit: o.produit.produit,
          gamme,
          canal,
          quantite,
          prixUnitaireCentimes: prixDuCanal(o.produit, canal),
        });
      }
    }
  }

  return ventes;
}
