export type Branded<T, B extends string> = T & { readonly __brand: B };

export type Centimes = Branded<number, "centimes">;
export type Minutes = Branded<number, "minutes">;
export type MoisJeu = Branded<number, "moisJeu">;
export type Graine = Branded<number, "graine">;

// Le temps (heure du jeu, pas, mois calendaires) se manipule avec moteur/temps.ts :
// un mois de jeu est un mois calendaire réel, de longueur variable.

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
