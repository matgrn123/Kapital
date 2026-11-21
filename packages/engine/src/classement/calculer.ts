import { centimes } from "../types/primitifs.js";
import type { EcritureClassement, LigneClassement, ValeurEntreprise } from "./types.js";

const COMPTES_ACTIF = new Set(["31", "35", "411", "44566", "512"]);
const COMPTES_PASSIF_EXTERNE = new Set([
  "164",
  "401",
  "421",
  "431",
  "444",
  "44571",
]);

export function calculerValeurEntreprise(
  ecritures: readonly EcritureClassement[],
): ValeurEntreprise {
  let actif = 0;
  let passifExterne = 0;

  for (const e of ecritures) {
    if (COMPTES_ACTIF.has(e.compte)) {
      actif += e.sens === "debit" ? e.montant_centimes : -e.montant_centimes;
    }
    if (COMPTES_PASSIF_EXTERNE.has(e.compte)) {
      passifExterne +=
        e.sens === "credit" ? e.montant_centimes : -e.montant_centimes;
    }
  }

  return {
    actif_centimes: centimes(actif),
    passif_externe_centimes: centimes(passifExterne),
    valeur_centimes: centimes(actif - passifExterne),
  };
}

export type EntreeClassement = {
  readonly company_id: string;
  readonly nom: string;
  readonly pseudo: string;
  readonly gamme: string;
  readonly valeur_centimes: number;
};

export function ordonnerClassement(
  entrees: readonly EntreeClassement[],
): readonly LigneClassement[] {
  const triees = [...entrees].sort((a, b) => {
    if (b.valeur_centimes !== a.valeur_centimes) {
      return b.valeur_centimes - a.valeur_centimes;
    }
    return a.nom.localeCompare(b.nom, "fr");
  });
  return triees.map((e, i) => ({
    rang: i + 1,
    company_id: e.company_id,
    nom: e.nom,
    pseudo: e.pseudo,
    gamme: e.gamme,
    valeur_centimes: centimes(e.valeur_centimes),
  }));
}
