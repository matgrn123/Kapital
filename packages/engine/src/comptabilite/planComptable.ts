import { ajouterComptes, grandLivreVide } from "./grandLivre.js";
import type { Compte, GrandLivre } from "./types.js";

export const PLAN_COMPTABLE_V1: readonly Compte[] = [
  { numero: "101", libelle: "Capital social", type: "passif" },
  {
    numero: "164",
    libelle: "Emprunts auprès des établissements de crédit",
    type: "passif",
  },
  { numero: "31", libelle: "Stocks de matières premières", type: "actif" },
  { numero: "35", libelle: "Stocks de produits finis", type: "actif" },
  { numero: "401", libelle: "Fournisseurs", type: "passif" },
  { numero: "411", libelle: "Clients", type: "actif" },
  { numero: "44566", libelle: "TVA déductible", type: "actif" },
  { numero: "44571", libelle: "TVA collectée", type: "passif" },
  { numero: "512", libelle: "Banque", type: "actif" },
  {
    numero: "601",
    libelle: "Achats de matières premières",
    type: "charges",
  },
  {
    numero: "641",
    libelle: "Rémunérations du personnel",
    type: "charges",
  },
  { numero: "707", libelle: "Ventes de produits finis", type: "produits" },
];

export function planComptableV1(): GrandLivre {
  return ajouterComptes(grandLivreVide(), PLAN_COMPTABLE_V1);
}
