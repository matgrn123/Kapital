import { ajouterComptes, grandLivreVide } from "./grandLivre.js";
import type { Compte, GrandLivre } from "./types.js";

export const PLAN_COMPTABLE_V1: readonly Compte[] = [
  { numero: "101", libelle: "Capital social", type: "passif" },
  {
    numero: "164",
    libelle: "Emprunts auprès des établissements de crédit",
    type: "passif",
  },
  { numero: "2815", libelle: "Amortissement du matériel industriel", type: "passif" },
  { numero: "31", libelle: "Stocks de matières premières", type: "actif" },
  { numero: "35", libelle: "Stocks de produits finis", type: "actif" },
  { numero: "401", libelle: "Fournisseurs", type: "passif" },
  { numero: "411", libelle: "Clients", type: "actif" },
  { numero: "44551", libelle: "TVA à payer", type: "passif" },
  { numero: "44566", libelle: "TVA déductible", type: "actif" },
  { numero: "44571", libelle: "TVA collectée", type: "passif" },
  { numero: "512", libelle: "Banque", type: "actif" },
  {
    numero: "601",
    libelle: "Achats de matières premières",
    type: "charges",
  },
  {
    numero: "606",
    libelle: "Achats non stockés (énergie, fournitures)",
    type: "charges",
  },
  {
    numero: "613",
    libelle: "Locations",
    type: "charges",
  },
  {
    numero: "623",
    libelle: "Publicité, publications, relations publiques",
    type: "charges",
  },
  {
    numero: "641",
    libelle: "Rémunérations du personnel",
    type: "charges",
  },
  {
    numero: "645",
    libelle: "Charges de sécurité sociale et de prévoyance",
    type: "charges",
  },
  {
    numero: "421",
    libelle: "Personnel - rémunérations dues",
    type: "passif",
  },
  {
    numero: "431",
    libelle: "Sécurité sociale (URSSAF)",
    type: "passif",
  },
  {
    numero: "444",
    libelle: "État - impôts sur les bénéfices",
    type: "passif",
  },
  {
    numero: "661",
    libelle: "Charges d'intérêts",
    type: "charges",
  },
  {
    numero: "681",
    libelle: "Dotations aux amortissements",
    type: "charges",
  },
  {
    numero: "695",
    libelle: "Impôt sur les bénéfices",
    type: "charges",
  },
  { numero: "707", libelle: "Ventes de produits finis", type: "produits" },
  {
    numero: "7135",
    libelle: "Variation des stocks de produits finis",
    type: "produits",
  },
  {
    numero: "6228",
    libelle: "Charges externes diverses (retours, logistique)",
    type: "charges",
  },
];

export function planComptableV1(): GrandLivre {
  return ajouterComptes(grandLivreVide(), PLAN_COMPTABLE_V1);
}
