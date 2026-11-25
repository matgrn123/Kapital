export type TypeCompte = "actif" | "passif" | "charges" | "produits";

export type CompteV1 = {
  readonly numero: string;
  readonly libelle: string;
  readonly type: TypeCompte;
};

// Miroir simplifié de @kapital/engine PLAN_COMPTABLE_V1.
// Garde l'UI stable même si on change les détails du moteur.
export const PLAN_COMPTABLE: readonly CompteV1[] = [
  { numero: "101", libelle: "Capital social", type: "passif" },
  { numero: "164", libelle: "Emprunts bancaires", type: "passif" },
  { numero: "213", libelle: "Constructions", type: "actif" },
  { numero: "2813", libelle: "Amortissement des constructions", type: "passif" },
  { numero: "275", libelle: "Dépôts et cautionnements versés", type: "actif" },
  { numero: "31", libelle: "Stocks de matières premières", type: "actif" },
  { numero: "35", libelle: "Stocks de produits finis", type: "actif" },
  { numero: "401", libelle: "Fournisseurs", type: "passif" },
  { numero: "411", libelle: "Clients", type: "actif" },
  { numero: "421", libelle: "Personnel - rémunérations dues", type: "passif" },
  { numero: "431", libelle: "Sécurité sociale (URSSAF)", type: "passif" },
  { numero: "444", libelle: "État - impôts sur bénéfices", type: "passif" },
  { numero: "44566", libelle: "TVA déductible", type: "actif" },
  { numero: "44571", libelle: "TVA collectée", type: "passif" },
  { numero: "2154", libelle: "Matériel industriel", type: "actif" },
  { numero: "512", libelle: "Banque", type: "actif" },
  { numero: "6228", libelle: "Charges externes diverses", type: "charges" },
  { numero: "623", libelle: "Publicité, publications, relations publiques", type: "charges" },
  { numero: "601", libelle: "Achats de matières premières", type: "charges" },
  { numero: "613", libelle: "Locations", type: "charges" },
  { numero: "614", libelle: "Charges locatives", type: "charges" },
  { numero: "641", libelle: "Rémunérations du personnel", type: "charges" },
  { numero: "645", libelle: "Cotisations sociales", type: "charges" },
  { numero: "661", libelle: "Charges d'intérêts", type: "charges" },
  { numero: "695", libelle: "Impôt sur les bénéfices", type: "charges" },
  { numero: "707", libelle: "Ventes de produits finis", type: "produits" },
  { numero: "7135", libelle: "Variation des stocks de produits finis", type: "produits" },
];

export function compteParNumero(numero: string): CompteV1 | undefined {
  return PLAN_COMPTABLE.find((c) => c.numero === numero);
}
