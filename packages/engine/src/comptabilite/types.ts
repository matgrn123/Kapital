import type { Centimes, MoisJeu } from "../types/primitifs.js";

export type TypeCompte = "actif" | "passif" | "charges" | "produits";

export type NumeroCompte = string;

export type Compte = {
  readonly numero: NumeroCompte;
  readonly libelle: string;
  readonly type: TypeCompte;
};

export type SensEcriture = "debit" | "credit";

export type LigneEcriture = {
  readonly compte: NumeroCompte;
  readonly sens: SensEcriture;
  readonly montant: Centimes;
};

export type EcritureComptable = {
  readonly id: string;
  readonly mois: MoisJeu;
  readonly libelle: string;
  readonly lignes: readonly LigneEcriture[];
};

export type GrandLivre = {
  readonly comptes: Readonly<Record<NumeroCompte, Compte>>;
  readonly ecritures: readonly EcritureComptable[];
};

export class ComptabiliteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComptabiliteError";
  }
}
