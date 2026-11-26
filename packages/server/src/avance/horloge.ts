import type { Parametres } from "@kapital/content";
import { configTempsDepuis, estMoisCalendaire, horlogeDepuis, type Horloge } from "@kapital/engine";
import type { StockageMonde } from "./port.js";

/** Ce que tous les joueurs voient : la même date de jeu au même instant. */
export type HorlogeDuMonde =
  | { readonly actif: false; readonly moisCourant: number }
  | { readonly actif: true; readonly maintenantMs: number; readonly horloge: Horloge };

/**
 * Lit l'horloge commune. `maintenantMs` vient du serveur : aucune date n'est lue
 * dans la requête du navigateur.
 */
export async function lireHorloge(
  stockage: StockageMonde,
  params: Parametres,
  maintenantMs: number,
): Promise<HorlogeDuMonde> {
  const monde = await stockage.chargerMondeActif();
  if (!monde) throw new Error("Aucun monde actif");
  // Origine pas encore fixée, ou monde encore sur l'ancien compteur de mois (avant la
  // migration 0043) : pas d'horloge à montrer.
  if (monde.debutReelMs === null || !estMoisCalendaire(monde.moisCourant)) {
    return { actif: false, moisCourant: monde.moisCourant };
  }
  return {
    actif: true,
    maintenantMs,
    horloge: horlogeDepuis(configTempsDepuis(params), monde.debutReelMs, maintenantMs),
  };
}
