import type { Parametres } from "@kapital/content";
import type { Entreprise, Gamme, ProduitEntreprise } from "../types/entreprise.js";
import type { Monde } from "../types/monde.js";
import {
  centimes,
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
  readonly canal: "vente_directe" | "revendeur";
  readonly quantite: number;
  readonly prixUnitaireCentimes: Centimes;
};

const GAMMES: readonly Gamme[] = ["entree", "milieu", "haut"];

function tailleMarcheMois(params: Parametres, gamme: Gamme): number {
  const p = params[`taille_marche_mois_${gamme}`];
  if (!p) {
    throw new Error(`Paramètre manquant : taille_marche_mois_${gamme}`);
  }
  return p.valeur;
}

function entrepriseVendProduit(
  ent: Entreprise,
  produit: ProduitEntreprise,
  canal: "vente_directe" | "revendeur",
): boolean {
  if (ent.statut !== "active") return false;
  const prix = produit.prix[canal];
  if (prix <= 0) return false;
  return true;
}

function construireOffre(
  ent: Entreprise,
  produit: ProduitEntreprise,
  canal: "vente_directe" | "revendeur",
): OffreEntreprise {
  const presenceRev = canal === "revendeur" ? 1 : 0;
  return {
    entreprise: ent.id,
    qualite: produit.qualiteVisee,
    notoriete: ent.marque.notoriete,
    desirabilite: ent.marque.desirabilite,
    presenceRevendeur: presenceRev,
    prix: produit.prix[canal],
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

    for (const canal of ["vente_directe", "revendeur"] as const) {
      const offresAvecContexte: Array<{
        entreprise: Entreprise;
        produit: ProduitEntreprise;
        offre: OffreEntreprise;
      }> = [];
      for (const ent of entreprisesGamme) {
        for (const prod of ent.catalogue) {
          if (!entrepriseVendProduit(ent, prod, canal)) continue;
          offresAvecContexte.push({
            entreprise: ent,
            produit: prod,
            offre: construireOffre(ent, prod, canal),
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

      // Volume total adressable par ce canal dans cette gamme sur la durée
      const partCanal = canal === "vente_directe" ? 0.6 : 0.4;
      const volumeTotal = taille * dureeMois * partCanal;

      for (const o of offresAvecContexte) {
        const part = parts.parts[o.entreprise.id] ?? 0;
        const quantite = Math.floor(volumeTotal * part);
        if (quantite <= 0) continue;
        ventes.push({
          entreprise: o.entreprise.id,
          produit: o.produit.produit,
          gamme,
          canal,
          quantite,
          prixUnitaireCentimes: centimes(o.produit.prix[canal]),
        });
      }
    }
  }

  return ventes;
}
