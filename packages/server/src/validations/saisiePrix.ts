// Contrôle des valeurs envoyées par l'écran Vente avant enregistrement (route fixer-prix).
// Tout est en entiers : centimes pour les prix, pièces pour la production, points pour la qualité.

export type SaisiePrix = {
  readonly prixVenteDirecteCentimes?: number;
  readonly prixRevendeurCentimes?: number;
  readonly productionMensuelleCible?: number;
  readonly qualiteVisee?: number;
};

export type ResultatSaisiePrix =
  | { readonly ok: true; readonly valeurs: { pd: number; pr: number; prod: number; q: number } }
  | {
      readonly ok: false;
      readonly code: "prix_invalide" | "production_invalide" | "qualite_invalide";
      readonly message: string;
    };

const entier = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

export function validerSaisiePrix(s: SaisiePrix): ResultatSaisiePrix {
  const pd = s.prixVenteDirecteCentimes ?? 0;
  const pr = s.prixRevendeurCentimes ?? 0;
  const prod = s.productionMensuelleCible ?? 0;
  const q = s.qualiteVisee ?? 60;
  if (!entier(pd) || !entier(pr) || pd <= 0 || pr <= 0) {
    return { ok: false, code: "prix_invalide", message: "Les prix doivent être strictement positifs, au centime près." };
  }
  if (!entier(prod) || prod < 0) {
    return {
      ok: false,
      code: "production_invalide",
      message: "La production mensuelle doit être un nombre entier de pièces, zéro ou plus.",
    };
  }
  if (!entier(q) || q < 0 || q > 100) {
    return { ok: false, code: "qualite_invalide", message: "La qualité visée est un nombre entier entre 0 et 100." };
  }
  return { ok: true, valeurs: { pd, pr, prod, q } };
}
