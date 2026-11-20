export type Branded<T, B extends string> = T & { readonly __brand: B };

export type Centimes = Branded<number, "centimes">;
export type Minutes = Branded<number, "minutes">;
export type MoisJeu = Branded<number, "moisJeu">;
export type Graine = Branded<number, "graine">;

// Minutes réelles depuis la création du monde (ratio 24:1 → 1 mois jeu = 1440 min réelles)
export type InstantJeu = Branded<number, "instantJeu">;

// Durée en mois jeu (peut être fractionnaire)
export type DureeMois = Branded<number, "dureeMois">;

export const MINUTES_PAR_MOIS_JEU = 1440;

export function centimes(n: number): Centimes {
  if (!Number.isInteger(n)) {
    throw new Error(`Centimes doit être un entier, reçu ${n}.`);
  }
  return n as Centimes;
}

export function minutes(n: number): Minutes {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Minutes doit être un entier positif ou nul, reçu ${n}.`);
  }
  return n as Minutes;
}

export function moisJeu(n: number): MoisJeu {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`MoisJeu doit être un entier >= 0, reçu ${n}.`);
  }
  return n as MoisJeu;
}

export function graine(n: number): Graine {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Graine doit être un entier >= 0, reçu ${n}.`);
  }
  return n as Graine;
}

export function instantJeu(n: number): InstantJeu {
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`InstantJeu doit être un nombre fini >= 0, reçu ${n}.`);
  }
  return n as InstantJeu;
}

export function dureeMois(n: number): DureeMois {
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`DureeMois doit être un nombre fini >= 0, reçu ${n}.`);
  }
  return n as DureeMois;
}

export function dureeMoisEntre(debut: InstantJeu, fin: InstantJeu): DureeMois {
  if (fin < debut) {
    throw new Error(`fin (${fin}) doit être >= debut (${debut}).`);
  }
  return dureeMois((fin - debut) / MINUTES_PAR_MOIS_JEU);
}

export function moisCourantDepuisInstant(instant: InstantJeu): MoisJeu {
  return moisJeu(Math.floor(instant / MINUTES_PAR_MOIS_JEU));
}

export type Id<Tag extends string> = Branded<string, `id_${Tag}`>;

export type IdEntreprise = Id<"entreprise">;
export type IdProduit = Id<"produit">;
export type IdMatiere = Id<"matiere">;
export type IdSalarie = Id<"salarie">;
export type IdPret = Id<"pret">;
export type IdFournisseur = Id<"fournisseur">;
export type IdFaconnier = Id<"faconnier">;

export const idEntreprise = (s: string): IdEntreprise => s as IdEntreprise;
export const idProduit = (s: string): IdProduit => s as IdProduit;
export const idMatiere = (s: string): IdMatiere => s as IdMatiere;
export const idSalarie = (s: string): IdSalarie => s as IdSalarie;
export const idPret = (s: string): IdPret => s as IdPret;
export const idFournisseur = (s: string): IdFournisseur => s as IdFournisseur;
export const idFaconnier = (s: string): IdFaconnier => s as IdFaconnier;
