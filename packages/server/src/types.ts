import type {
  CatalogueFournisseur,
  Entreprise,
  Fournisseur,
  Produit,
} from "@kapital/engine";

export type ResultOk = { readonly ok: true };
export type ResultErreur = {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
};
export type Result = ResultOk | ResultErreur;

export type ContexteValidation = {
  readonly entreprise: Entreprise;
  readonly fournisseurs?: readonly Fournisseur[];
  readonly catalogues?: readonly CatalogueFournisseur[];
  readonly produits?: readonly Produit[];
};

export const ok = (): Result => ({ ok: true });

export const refuse = (code: string, message: string): Result => ({
  ok: false,
  code,
  message,
});
