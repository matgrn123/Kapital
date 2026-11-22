import type { Parametres } from "@kapital/content";
import { centimes, type Centimes } from "../types/primitifs.js";

// Coût de revient estimé pour un produit, à partir de sa nomenclature et
// des prix matière courants. Utilisé par avancerMonde pour écrire les
// contreparties comptables des ventes (7135/35) avec un montant réaliste
// avant que le flux atelier/façonnier complet soit en place (T27).

export type EntreesCoutRevientEstime = {
  readonly consommationParPiece: number;
  readonly fournituresParPieceCentimes: number;
  readonly prixMatiereParUniteCentimes: number;
};

export function coutRevientEstime(
  e: EntreesCoutRevientEstime,
  params: Parametres,
): Centimes {
  const tauxChute = params["taux_chute_matiere_defaut"]?.valeur ?? 0.15;
  const prixFacon = params["prix_facon_moyen_centimes_par_piece"]?.valeur ?? 500;

  const matiere = Math.round(
    e.prixMatiereParUniteCentimes * e.consommationParPiece * (1 + tauxChute),
  );
  return centimes(matiere + e.fournituresParPieceCentimes + prixFacon);
}
