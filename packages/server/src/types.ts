import type {
  CatalogueFournisseur,
  ConditionManquante,
  EtapeEntreprise,
  SeuilsEtapes,
  Entreprise,
  Fournisseur,
  Produit,
} from "@kapital/engine";

export type ResultOk = { readonly ok: true };
export type ResultErreur = {
  readonly ok: false;
  /** Clé stable du refus (l'interface y associe sa phrase). */
  readonly code: string;
  readonly message: string;
  /** Refus d'étape : l'étape qui débloque l'action et ce qu'il manque, chiffré. */
  readonly etapeRequise?: EtapeEntreprise;
  readonly conditions?: readonly ConditionManquante[];
};
export type Result = ResultOk | ResultErreur;

export type ContexteValidation = {
  readonly entreprise: Entreprise;
  readonly fournisseurs?: readonly Fournisseur[];
  readonly catalogues?: readonly CatalogueFournisseur[];
  readonly produits?: readonly Produit[];
  /** Seuils de passage d'étape ; par défaut ceux des paramètres V1. */
  readonly seuilsEtapes?: SeuilsEtapes;
};

export const ok = (): Result => ({ ok: true });

export const refuse = (code: string, message: string): Result => ({
  ok: false,
  code,
  message,
});
